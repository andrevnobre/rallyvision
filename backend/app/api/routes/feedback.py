import base64

from fastapi import APIRouter, Depends, Form, UploadFile, File
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.coach_feedback import CoachFeedback

router = APIRouter(prefix="/feedback", tags=["feedback"])

MAX_AUDIO_BYTES = 10 * 1024 * 1024  # 10 MB


@router.post("", status_code=201)
async def submit_feedback(
    name: str | None = Form(None),
    email: str | None = Form(None),
    text_feedback: str | None = Form(None),
    audio: UploadFile | None = File(None),
    db: Session = Depends(get_db),
):
    audio_b64: str | None = None
    audio_mime: str | None = None

    if audio and audio.filename:
        raw = await audio.read(MAX_AUDIO_BYTES + 1)
        if len(raw) <= MAX_AUDIO_BYTES:
            audio_b64 = base64.b64encode(raw).decode()
            audio_mime = audio.content_type or "audio/webm"

    entry = CoachFeedback(
        name=name or None,
        email=email or None,
        text_feedback=text_feedback or None,
        audio_mime=audio_mime,
        audio_b64=audio_b64,
    )
    db.add(entry)
    db.commit()
    return {"ok": True, "id": entry.id}
