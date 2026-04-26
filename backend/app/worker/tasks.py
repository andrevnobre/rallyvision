import json
import logging
import tempfile
from pathlib import Path

import redis as redis_lib

from app.config import settings
from app.database import SessionLocal
from app.models.video import Video
from app.services.storage import download_video
from app.worker.celery_app import celery_app

logger = logging.getLogger(__name__)

_redis = redis_lib.from_url(settings.redis_url, decode_responses=True)
_PROGRESS_TTL = 7200  # 2h


def _set_progress(video_id: str, pct: int) -> None:
    try:
        _redis.set(f"btvision:progress:{video_id}", pct, ex=_PROGRESS_TTL)
    except Exception:
        pass  # não crítico


def _set_status(video_id: str, status: str, result: dict | None = None, error: str | None = None):
    db = SessionLocal()
    try:
        video = db.get(Video, video_id)
        if video:
            video.status = status
            if result is not None:
                video.result = json.dumps(result)
            if error is not None:
                video.error = error
            db.commit()
    finally:
        db.close()


@celery_app.task(bind=True, name="process_video")
def process_video(self, video_id: str, storage_key: str, camera_orientation: str | None = None):
    logger.info(f"[{video_id}] Iniciando processamento")
    _set_status(video_id, "processing")
    self.update_state(state="STARTED", meta={"progress": 0})

    db = SessionLocal()
    try:
        video = db.get(Video, video_id)
        court_roi = json.loads(video.court_roi) if video and video.court_roi else None
    finally:
        db.close()

    try:
        with tempfile.NamedTemporaryFile(suffix=Path(storage_key).suffix, delete=False) as tmp:
            tmp_path = Path(tmp.name)

        download_video(storage_key, tmp_path)
        logger.info(f"[{video_id}] Vídeo descarregado para {tmp_path}")

        from app.worker.pipeline import run_pipeline

        def on_progress(pct: int):
            self.update_state(state="PROGRESS", meta={"progress": pct})
            _set_progress(video_id, pct)

        result = run_pipeline(tmp_path, court_roi=court_roi, camera_orientation=camera_orientation, progress_cb=on_progress)
        tmp_path.unlink(missing_ok=True)

        _set_progress(video_id, 100)
        _set_status(video_id, "done", result=result)
        logger.info(
            f"[{video_id}] Concluído — bola {result['ball_detection_pct']}% "
            f"jogadores {result['player_2_detection_pct']}%"
        )
        return {"video_id": video_id, "status": "done"}

    except Exception as exc:
        logger.exception(f"[{video_id}] Falhou: {exc}")
        _set_status(video_id, "failed", error=str(exc))
        raise
