"""
Standalone GPU worker for rallyvision.
Polls SQS → downloads video from S3 → runs pipeline → reports to API → self-terminates when idle.
"""
import json
import logging
import os
import sys
import tempfile
import time
from pathlib import Path

import boto3
import httpx

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S",
)
logger = logging.getLogger(__name__)

SQS_URL = os.environ["SQS_URL"]
AWS_REGION = os.environ.get("AWS_REGION", "eu-west-1")
MODELS_DIR = Path(os.environ.get("MODELS_DIR", "/opt/models"))
IDLE_TIMEOUT_S = int(os.environ.get("IDLE_TIMEOUT_S", "300"))  # 5 min idle → terminate
POLL_WAIT_S = 20  # SQS long poll max


def _s3():
    return boto3.client("s3", region_name=AWS_REGION)


def _sqs():
    return boto3.client("sqs", region_name=AWS_REGION)


def _ec2():
    return boto3.client("ec2", region_name=AWS_REGION)


def _self_terminate():
    """Retrieve own instance-id from IMDS v2 and terminate."""
    try:
        import requests as req_lib
        token = req_lib.put(
            "http://169.254.169.254/latest/api/token",
            headers={"X-aws-ec2-metadata-token-ttl-seconds": "21600"},
            timeout=3,
        ).text
        instance_id = req_lib.get(
            "http://169.254.169.254/latest/meta-data/instance-id",
            headers={"X-aws-ec2-metadata-token": token},
            timeout=3,
        ).text
        logger.info(f"Auto-terminando instância {instance_id}")
        _ec2().terminate_instances(InstanceIds=[instance_id])
    except Exception as exc:
        logger.error(f"Falha ao auto-terminar: {exc}")
        sys.exit(0)


def _report_progress(api_url: str, api_key: str, video_id: str, pct: int) -> None:
    try:
        httpx.put(
            f"{api_url}/internal/videos/{video_id}/progress",
            json={"progress": pct},
            headers={"X-Worker-Key": api_key},
            timeout=10,
        )
    except Exception:
        pass  # não crítico


def _report_complete(api_url: str, api_key: str, video_id: str, result: dict) -> None:
    httpx.put(
        f"{api_url}/internal/videos/{video_id}/complete",
        json=result,
        headers={"X-Worker-Key": api_key},
        timeout=60,
    )


def _report_fail(api_url: str, api_key: str, video_id: str, error: str) -> None:
    try:
        httpx.put(
            f"{api_url}/internal/videos/{video_id}/fail",
            json={"error": error},
            headers={"X-Worker-Key": api_key},
            timeout=10,
        )
    except Exception:
        pass


def _patch_pipeline_paths() -> None:
    """Override hardcoded model paths in pipeline.py to use MODELS_DIR."""
    import pipeline as pl
    pl.MODELS_DIR = MODELS_DIR
    pl.BALL_WEIGHTS = MODELS_DIR / "ball_yolo.pt"
    pl.PLAYER_WEIGHTS = str(MODELS_DIR / "yolov8s.pt")


def process_job(msg: dict, receipt_handle: str) -> None:
    video_id = msg["video_id"]
    storage_key = msg["storage_key"]
    court_roi = msg.get("court_roi")
    camera_orientation = msg.get("camera_orientation")
    net_points = msg.get("net_points")
    api_url = msg["api_url"].rstrip("/")
    api_key = msg["api_key"]
    bucket = msg["bucket"]

    logger.info(f"[{video_id}] Job recebido — storage_key={storage_key}")

    suffix = Path(storage_key).suffix or ".mp4"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp_path = Path(tmp.name)

    try:
        logger.info(f"[{video_id}] Download s3://{bucket}/{storage_key} → {tmp_path}")
        _s3().download_file(bucket, storage_key, str(tmp_path))
        size_mb = tmp_path.stat().st_size / 1e6
        logger.info(f"[{video_id}] Download concluído ({size_mb:.0f} MB)")

        _patch_pipeline_paths()
        from pipeline import run_pipeline

        def on_progress(pct: int) -> None:
            _report_progress(api_url, api_key, video_id, pct)

        result = run_pipeline(
            tmp_path,
            court_roi=court_roi,
            camera_orientation=camera_orientation,
            net_points=net_points,
            progress_cb=on_progress,
        )

        _report_complete(api_url, api_key, video_id, result)
        logger.info(f"[{video_id}] Concluído — bola {result['ball_detection_pct']}%")

    except Exception as exc:
        logger.exception(f"[{video_id}] Falhou: {exc}")
        _report_fail(api_url, api_key, video_id, str(exc))

    finally:
        tmp_path.unlink(missing_ok=True)
        _sqs().delete_message(QueueUrl=SQS_URL, ReceiptHandle=receipt_handle)
        logger.info(f"[{video_id}] Mensagem SQS eliminada")


def main() -> None:
    logger.info(f"GPU worker iniciado | MODELS_DIR={MODELS_DIR} | idle_timeout={IDLE_TIMEOUT_S}s")
    sqs = _sqs()
    idle_since = time.time()

    while True:
        if time.time() - idle_since > IDLE_TIMEOUT_S:
            logger.info("Timeout de inatividade atingido — a terminar instância")
            _self_terminate()
            return

        resp = sqs.receive_message(
            QueueUrl=SQS_URL,
            MaxNumberOfMessages=1,
            WaitTimeSeconds=POLL_WAIT_S,
            VisibilityTimeout=7200,
        )

        messages = resp.get("Messages", [])
        if not messages:
            remaining = int(IDLE_TIMEOUT_S - (time.time() - idle_since))
            logger.info(f"Sem mensagens | idle há {int(time.time() - idle_since)}s (termina em {remaining}s)")
            continue

        idle_since = time.time()
        body = json.loads(messages[0]["Body"])
        receipt = messages[0]["ReceiptHandle"]
        process_job(body, receipt)
        idle_since = time.time()


if __name__ == "__main__":
    main()
