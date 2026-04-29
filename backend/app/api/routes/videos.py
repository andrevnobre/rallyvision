import json
import uuid
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, UploadFile
from fastapi.responses import FileResponse, RedirectResponse, Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.models.video import Video
from app.models.video_participant import VideoParticipant
from app.schemas.coach import AddParticipantsRequest, ParticipantItem
from app.schemas.video import ProcessRequest, SharedVideoResponse, VideoStatusResponse, VideoUploadResponse
from app.services.auth import get_current_user
from app.services.storage import get_local_path, get_presigned_url, get_thumbnail_jpeg, stream_and_store, upload_thumbnail
from app.worker.tasks import process_video

router = APIRouter(prefix="/videos", tags=["videos"])

ALLOWED_EXTENSIONS = {".mp4", ".mov", ".avi", ".mkv"}
MAX_SIZE_BYTES = 2 * 1024 * 1024 * 1024  # 2 GB


def _own_or_404(video_id: str, current_user: User, db: Session) -> Video:
    """Devolve o vídeo se o utilizador for dono ou participante."""
    video = db.get(Video, video_id)
    if not video:
        raise HTTPException(404, "Vídeo não encontrado")
    if video.user_id == current_user.id:
        return video
    is_participant = (
        db.query(VideoParticipant)
        .filter(VideoParticipant.video_id == video_id, VideoParticipant.user_id == current_user.id)
        .first()
    ) is not None
    if not is_participant:
        raise HTTPException(403, "Sem permissão")
    return video


def _owner_or_403(video_id: str, current_user: User, db: Session) -> Video:
    """Devolve o vídeo apenas se o utilizador for o dono (para operações destrutivas)."""
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
    own = (
        db.query(Video)
        .filter(Video.user_id == current_user.id)
        .order_by(Video.created_at.desc())
        .all()
    )
    own_ids = {v.id for v in own}

    participant = (
        db.query(Video)
        .join(VideoParticipant, VideoParticipant.video_id == Video.id)
        .filter(VideoParticipant.user_id == current_user.id)
        .order_by(Video.created_at.desc())
        .all()
    )

    result = [VideoStatusResponse.model_validate(v) for v in own]
    for v in participant:
        if v.id not in own_ids:
            r = VideoStatusResponse.model_validate(v)
            r.is_participant = True
            result.append(r)

    result.sort(key=lambda v: v.created_at, reverse=True)
    return result


@router.post("/upload", response_model=VideoUploadResponse, status_code=201)
async def upload(
    file: UploadFile,
    background_tasks: BackgroundTasks,
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

    # Pré-aquece GPU em background para esconder latência atrás da seleção de ROI
    background_tasks.add_task(_prewarm_gpu, video.id)

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

    video = _owner_or_403(video_id, current_user, db)
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


_GPU_WORKER_TAGS = [{"ResourceType": "instance", "Tags": [
    {"Key": "Name", "Value": "rallyvision-gpu-worker"},
    {"Key": "Purpose", "Value": "rallyvision-gpu-worker"},
]}]


def _gpu_worker_running(ec2, log) -> bool:
    """Verifica se já existe um worker GPU ativo (pending ou running)."""
    resp = ec2.describe_instances(Filters=[
        {"Name": "tag:Purpose", "Values": ["rallyvision-gpu-worker"]},
        {"Name": "instance-state-name", "Values": ["pending", "running"]},
    ])
    for r in resp["Reservations"]:
        if r["Instances"]:
            log.info(f"Worker GPU já ativo: {r['Instances'][0]['InstanceId']}")
            return True
    return False


def _launch_gpu_instance(ec2, label: str, log) -> None:
    """Lança instância spot com fallback on-demand."""
    from botocore.exceptions import ClientError
    from app.config import settings

    try:
        ec2.run_instances(
            LaunchTemplate={"LaunchTemplateId": settings.launch_template_id, "Version": "$Default"},
            MinCount=1, MaxCount=1,
            InstanceMarketOptions={"MarketType": "spot", "SpotOptions": {
                "SpotInstanceType": "one-time", "InstanceInterruptionBehavior": "terminate",
            }},
            TagSpecifications=_GPU_WORKER_TAGS,
        )
        log.info(f"[{label}] EC2 spot g5.xlarge lançada")
    except ClientError as e:
        if e.response["Error"]["Code"] in (
            "MaxSpotInstanceCountExceeded", "InsufficientInstanceCapacity", "SpotMaxPriceTooLow"
        ):
            log.warning(f"[{label}] Spot indisponível, a usar on-demand")
            ec2.run_instances(
                LaunchTemplate={"LaunchTemplateId": settings.launch_template_id, "Version": "$Default"},
                MinCount=1, MaxCount=1,
                TagSpecifications=_GPU_WORKER_TAGS,
            )
            log.info(f"[{label}] EC2 on-demand g5.xlarge lançada")
        else:
            raise


def _prewarm_gpu(video_id: str) -> None:
    """Pré-aquece a instância GPU no momento do upload para esconder a latência de arranque."""
    import logging
    import boto3 as boto3_lib
    from app.config import settings

    if not settings.launch_template_id:
        return

    _log = logging.getLogger(__name__)
    ec2 = boto3_lib.client("ec2", region_name=settings.aws_region)
    try:
        if _gpu_worker_running(ec2, _log):
            _log.info(f"[{video_id}] Prewarm: worker já existe, nada a fazer")
            return
        _launch_gpu_instance(ec2, video_id, _log)
        _log.info(f"[{video_id}] GPU pré-aquecida no upload")
    except Exception as e:
        _log.warning(f"[{video_id}] Prewarm falhou (não crítico): {e}")


def _dispatch_gpu(video, body) -> None:
    """Envia mensagem SQS e lança EC2 se não houver worker já ativo."""
    import logging
    import boto3 as boto3_lib
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
    if _gpu_worker_running(ec2, _log):
        _log.info(f"[{video.id}] Worker já ativo — só enviou SQS")
        return

    _launch_gpu_instance(ec2, video.id, _log)


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


@router.get("/{video_id}/export")
def export_result(
    video_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    video = _owner_or_403(video_id, current_user, db)
    if not video.result:
        raise HTTPException(404, "Resultado não disponível — vídeo ainda não analisado")
    stem = Path(video.filename).stem
    return Response(
        content=video.result,
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="{stem}_result.json"'},
    )


@router.post("/{video_id}/share", response_model=VideoStatusResponse)
def create_share(
    video_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    video = _owner_or_403(video_id, current_user, db)
    if video.status != "done":
        raise HTTPException(409, "Só é possível partilhar vídeos já analisados")
    if not video.share_token:
        video.share_token = str(uuid.uuid4())
        db.commit()
        db.refresh(video)
    return video


@router.delete("/{video_id}/share", response_model=VideoStatusResponse)
def revoke_share(
    video_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    video = _owner_or_403(video_id, current_user, db)
    video.share_token = None
    db.commit()
    db.refresh(video)
    return video


@router.get("/shared/{token}", response_model=SharedVideoResponse)
def get_shared(token: str, db: Session = Depends(get_db)):
    video = db.query(Video).filter(Video.share_token == token).first()
    if not video:
        raise HTTPException(404, "Link de partilha inválido ou revogado")
    return video


@router.get("/{video_id}", response_model=VideoStatusResponse)
def get_status(
    video_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return _own_or_404(video_id, current_user, db)


@router.post("/{video_id}/participants", response_model=list[ParticipantItem], status_code=201)
def add_participants(
    video_id: str,
    body: AddParticipantsRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    video = _owner_or_403(video_id, current_user, db)
    existing_ids = {p.user_id for p in video.participants}
    added = []
    for email in body.emails:
        if email == current_user.email:
            continue
        user = db.query(User).filter(User.email == email).first()
        if not user or user.id in existing_ids:
            continue
        db.add(VideoParticipant(video_id=video.id, user_id=user.id))
        existing_ids.add(user.id)
        added.append(ParticipantItem(user_id=user.id, email=user.email, name=user.name))
    db.commit()
    return added


@router.delete("/{video_id}/participants/{user_id}", status_code=204)
def remove_participant(
    video_id: str,
    user_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _owner_or_403(video_id, current_user, db)
    row = (
        db.query(VideoParticipant)
        .filter(VideoParticipant.video_id == video_id, VideoParticipant.user_id == user_id)
        .first()
    )
    if not row:
        raise HTTPException(404, "Participante não encontrado neste vídeo")
    db.delete(row)
    db.commit()


@router.get("/{video_id}/participants", response_model=list[ParticipantItem])
def list_participants(
    video_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    video = _own_or_404(video_id, current_user, db)
    return [
        ParticipantItem(user_id=p.user.id, email=p.user.email, name=p.user.name)
        for p in video.participants
    ]
