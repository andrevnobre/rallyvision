from fastapi import APIRouter, Depends, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.video import Video
from app.schemas.video import VideoStatusResponse, VideoUploadResponse
from app.services.storage import upload_video
from app.worker.tasks import process_video

router = APIRouter(prefix="/videos", tags=["videos"])

ALLOWED_EXTENSIONS = {".mp4", ".mov", ".avi", ".mkv"}
MAX_SIZE_BYTES = 2 * 1024 * 1024 * 1024  # 2 GB


@router.post("/upload", response_model=VideoUploadResponse, status_code=201)
async def upload(file: UploadFile, db: Session = Depends(get_db)):
    # validar extensão
    from pathlib import Path
    ext = Path(file.filename or "").suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(400, f"Formato não suportado. Use: {', '.join(ALLOWED_EXTENSIONS)}")

    # ler ficheiro e validar tamanho
    data = await file.read()
    if len(data) > MAX_SIZE_BYTES:
        raise HTTPException(413, "Vídeo demasiado grande. Limite: 2 GB")

    storage_key = upload_video(data, file.filename)

    video = Video(filename=file.filename, storage_key=storage_key)
    db.add(video)
    db.commit()
    db.refresh(video)

    process_video.delay(video.id, storage_key)

    return video


@router.get("/{video_id}", response_model=VideoStatusResponse)
def get_status(video_id: str, db: Session = Depends(get_db)):
    video = db.get(Video, video_id)
    if not video:
        raise HTTPException(404, "Vídeo não encontrado")
    return video
