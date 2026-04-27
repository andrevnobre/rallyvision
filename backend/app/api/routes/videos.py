import json
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile
from fastapi.responses import FileResponse, RedirectResponse, Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.models.video import Video
from app.schemas.video import ProcessRequest, VideoStatusResponse, VideoUploadResponse
from app.services.auth import get_current_user
from app.services.storage import get_local_path, get_presigned_url, get_thumbnail_jpeg, stream_and_store, upload_thumbnail
from app.worker.tasks import process_video

router = APIRouter(prefix="/videos", tags=["videos"])

ALLOWED_EXTENSIONS = {".mp4", ".mov", ".avi", ".mkv"}
MAX_SIZE_BYTES = 2 * 1024 * 1024 * 1024  # 2 GB


def _own_or_404(video_id: str, current_user: User, db: Session) -> Video:
    video = db.get(Video, video_id)
    if not video:
        raise HTTPException(404, "Vídeo não encontrado")
    if video.user_id and video.user_id != current_user.id:
        raise HTTPException(403, "Sem permissão")
    return video


@router.get("/", response_model=list[VideoStatusResponse])
def list_videos(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return (
        db.query(Video)
        .filter(Video.user_id == current_user.id)
        .order_by(Video.created_at.desc())
        .all()
    )


@router.post("/upload", response_model=VideoUploadResponse, status_code=201)
async def upload(
    file: UploadFile,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ext = Path(file.filename or "").suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(400, f"Formato não suportado. Use: {', '.join(ALLOWED_EXTENSIONS)}")

    try:
        storage_key, first_bytes = await stream_and_store(file, file.filename, MAX_SIZE_BYTES)
    except ValueError as e:
        raise HTTPException(413, str(e))

    upload_thumbnail(first_bytes, storage_key)

    video = Video(filename=file.filename, storage_key=storage_key, status="pending_roi", user_id=current_user.id)
    db.add(video)
    db.commit()
    db.refresh(video)

    return video


@router.get("/{video_id}/thumbnail")
def get_thumbnail(video_id: str, db: Session = Depends(get_db)):
    video = db.get(Video, video_id)
    if not video:
        raise HTTPException(404, "Vídeo não encontrado")

    jpeg = get_thumbnail_jpeg(video.storage_key)
    if jpeg is None:
        raise HTTPException(404, "Thumbnail não disponível — reenvie o vídeo")
    return Response(content=jpeg, media_type="image/jpeg")


@router.post("/{video_id}/process", status_code=202)
def start_processing(
    video_id: str,
    body: ProcessRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    from app.config import settings

    video = _own_or_404(video_id, current_user, db)
    if video.status != "pending_roi":
        raise HTTPException(409, f"Estado inválido para iniciar processamento: {video.status}")

    video.court_roi = json.dumps(body.court_roi)
    video.net_points = json.dumps(body.net_points) if body.net_points else None
    video.status = "pending"
    db.commit()

    if settings.launch_template_id:
        _dispatch_gpu(video, body)
    else:
        process_video.delay(video.id, video.storage_key, body.camera_orientation)

    return {"status": "accepted"}


def _dispatch_gpu(video, body) -> None:
    """Send SQS message and launch EC2 spot instance (falls back to on-demand if quota exceeded)."""
    import logging
    import boto3 as boto3_lib
    from botocore.exceptions import ClientError
    from app.config import settings

    _log = logging.getLogger(__name__)

    msg = {
        "video_id": video.id,
        "storage_key": video.storage_key,
        "court_roi": body.court_roi,
        "camera_orientation": body.camera_orientation,
        "net_points": body.net_points,
        "api_url": settings.internal_api_url,
        "api_key": settings.worker_api_key,
        "bucket": settings.s3_bucket,
    }

    sqs = boto3_lib.client("sqs", region_name=settings.aws_region)
    sqs.send_message(QueueUrl=settings.sqs_url, MessageBody=json.dumps(msg))

    ec2 = boto3_lib.client("ec2", region_name=settings.aws_region)
    tags = [{"ResourceType": "instance", "Tags": [
        {"Key": "Name", "Value": "rallyvision-gpu-worker"},
        {"Key": "Purpose", "Value": "rallyvision-gpu-worker"},
    ]}]

    try:
        # Spot explícito — sobrepõe o $Default (on-demand) do launch template
        ec2.run_instances(
            LaunchTemplate={"LaunchTemplateId": settings.launch_template_id, "Version": "$Default"},
            MinCount=1, MaxCount=1,
            InstanceMarketOptions={"MarketType": "spot", "SpotOptions": {"SpotInstanceType": "one-time", "InstanceInterruptionBehavior": "terminate"}},
            TagSpecifications=tags,
        )
        _log.info(f"[{video.id}] EC2 spot g5.xlarge lançada")
    except ClientError as e:
        if e.response["Error"]["Code"] in ("MaxSpotInstanceCountExceeded", "InsufficientInstanceCapacity", "SpotMaxPriceTooLow"):
            _log.warning(f"[{video.id}] Spot indisponível ({e.response['Error']['Code']}), a usar on-demand")
            # Sem InstanceMarketOptions → usa o $Default do template (on-demand)
            ec2.run_instances(
                LaunchTemplate={"LaunchTemplateId": settings.launch_template_id, "Version": "$Default"},
                MinCount=1, MaxCount=1,
                TagSpecifications=tags,
            )
            _log.info(f"[{video.id}] EC2 on-demand g5.xlarge lançada")
        else:
            raise


@router.get("/{video_id}/stream")
def stream_video(video_id: str, db: Session = Depends(get_db)):
    video = db.get(Video, video_id)
    if not video:
        raise HTTPException(404, "Vídeo não encontrado")

    url = get_presigned_url(video.storage_key, expires=3600)
    if url:
        return RedirectResponse(url=url, status_code=307)

    path = get_local_path(video.storage_key)
    if not path.exists():
        raise HTTPException(404, "Ficheiro não encontrado no disco")
    ext = path.suffix.lower()
    media_types = {".mp4": "video/mp4", ".mov": "video/quicktime", ".avi": "video/x-msvideo", ".mkv": "video/x-matroska"}
    return FileResponse(str(path), media_type=media_types.get(ext, "video/mp4"), filename=video.filename)


@router.get("/{video_id}/progress")
def get_progress(video_id: str, db: Session = Depends(get_db)):
    video = db.get(Video, video_id)
    if not video:
        raise HTTPException(404, "Vídeo não encontrado")
    if video.status == "done":
        return {"progress": 100, "status": video.status}
    if video.status != "processing":
        return {"progress": 0, "status": video.status}
    import redis as redis_lib
    from app.config import settings
    r = redis_lib.from_url(settings.redis_url, decode_responses=True)
    val = r.get(f"btvision:progress:{video_id}")
    return {"progress": int(val) if val else 0, "status": video.status}


@router.get("/{video_id}", response_model=VideoStatusResponse)
def get_status(
    video_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return _own_or_404(video_id, current_user, db)
