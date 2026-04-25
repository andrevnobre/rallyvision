import json
from pathlib import Path

import cv2
from fastapi import APIRouter, Depends, HTTPException, UploadFile
from fastapi.responses import FileResponse, Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.models.video import Video
from app.schemas.video import ProcessRequest, VideoStatusResponse, VideoUploadResponse
from app.services.auth import get_current_user
from app.services.storage import get_local_path, upload_video
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

    data = await file.read()
    if len(data) > MAX_SIZE_BYTES:
        raise HTTPException(413, "Vídeo demasiado grande. Limite: 2 GB")

    storage_key = upload_video(data, file.filename)

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
    path = get_local_path(video.storage_key)
    cap = cv2.VideoCapture(str(path))
    ret, frame = cap.read()
    cap.release()

    if not ret:
        raise HTTPException(500, "Não foi possível extrair frame do vídeo")

    _, jpeg = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
    return Response(content=jpeg.tobytes(), media_type="image/jpeg")


@router.post("/{video_id}/process", status_code=202)
def start_processing(
    video_id: str,
    body: ProcessRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    video = _own_or_404(video_id, current_user, db)
    if video.status != "pending_roi":
        raise HTTPException(409, f"Estado inválido para iniciar processamento: {video.status}")

    video.court_roi = json.dumps(body.court_roi)
    video.status = "pending"
    db.commit()

    process_video.delay(video.id, video.storage_key, body.camera_orientation)
    return {"status": "accepted"}


@router.get("/{video_id}/stream")
def stream_video(video_id: str, db: Session = Depends(get_db)):
    video = db.get(Video, video_id)
    if not video:
        raise HTTPException(404, "Vídeo não encontrado")
    path = get_local_path(video.storage_key)
    if not path.exists():
        raise HTTPException(404, "Ficheiro não encontrado no disco")
    ext = path.suffix.lower()
    media_types = {".mp4": "video/mp4", ".mov": "video/quicktime", ".avi": "video/x-msvideo", ".mkv": "video/x-matroska"}
    return FileResponse(str(path), media_type=media_types.get(ext, "video/mp4"), filename=video.filename)


@router.get("/{video_id}", response_model=VideoStatusResponse)
def get_status(
    video_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return _own_or_404(video_id, current_user, db)
