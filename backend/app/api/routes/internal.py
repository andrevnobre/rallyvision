"""
Internal endpoints called by the GPU EC2 worker.
Authentication: X-Worker-Key header (shared secret).
"""
import json
import logging
from typing import Any

import redis as redis_lib
from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models.video import Video

router = APIRouter(prefix="/internal", tags=["internal"])
logger = logging.getLogger(__name__)

_PROGRESS_TTL = 7200


def _require_worker_key(x_worker_key: str = Header(...)):
    if not settings.worker_api_key or x_worker_key != settings.worker_api_key:
        raise HTTPException(403, "Chave inválida")


class ProgressBody(BaseModel):
    progress: int


class FailBody(BaseModel):
    error: str


@router.put("/videos/{video_id}/progress", dependencies=[Depends(_require_worker_key)])
def update_progress(video_id: str, body: ProgressBody):
    try:
        r = redis_lib.from_url(settings.redis_url, decode_responses=True)
        r.set(f"btvision:progress:{video_id}", body.progress, ex=_PROGRESS_TTL)
    except Exception:
        pass
    return {"ok": True}


@router.put("/videos/{video_id}/complete", dependencies=[Depends(_require_worker_key)])
def mark_complete(video_id: str, result: dict[str, Any], db: Session = Depends(get_db)):
    video = db.get(Video, video_id)
    if not video:
        raise HTTPException(404, "Vídeo não encontrado")
    video.status = "done"
    video.result = json.dumps(result)
    db.commit()
    logger.info(f"[{video_id}] Marcado como done via GPU worker")
    return {"ok": True}


@router.put("/videos/{video_id}/fail", dependencies=[Depends(_require_worker_key)])
def mark_fail(video_id: str, body: FailBody, db: Session = Depends(get_db)):
    video = db.get(Video, video_id)
    if not video:
        raise HTTPException(404, "Vídeo não encontrado")
    video.status = "failed"
    video.error = body.error
    db.commit()
    logger.info(f"[{video_id}] Marcado como failed via GPU worker: {body.error[:200]}")
    return {"ok": True}
