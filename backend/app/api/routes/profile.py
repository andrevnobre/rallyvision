import json

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.models.video import Video
from app.models.video_participant import VideoParticipant
from app.schemas.profile import ProfileResponse, UpdateProfileRequest, VideoHistoryItem
from app.services.auth import get_current_user, hash_password, verify_password

router = APIRouter(prefix="/profile", tags=["profile"])


def _extract_history_metrics(video: Video, is_participant: bool) -> VideoHistoryItem:
    rally_count = None
    avg_rally_duration_s = None
    ball_detection_pct = None
    duration_s = None

    if video.result:
        try:
            r = json.loads(video.result)
            rally_count = r.get("rally_count")
            avg_rally_duration_s = r.get("avg_rally_duration_s")
            ball_detection_pct = r.get("ball_detection_pct")
            duration_s = r.get("duration_s")
        except (json.JSONDecodeError, AttributeError):
            pass

    return VideoHistoryItem(
        id=video.id,
        filename=video.filename,
        created_at=video.created_at,
        rally_count=rally_count,
        avg_rally_duration_s=avg_rally_duration_s,
        ball_detection_pct=ball_detection_pct,
        duration_s=duration_s,
        is_participant=is_participant,
    )


@router.get("", response_model=ProfileResponse)
def get_profile(current_user: User = Depends(get_current_user)):
    return current_user


@router.patch("", response_model=ProfileResponse)
def update_profile(
    body: UpdateProfileRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if body.new_password:
        if not body.current_password:
            raise HTTPException(400, "current_password é obrigatório para alterar a password")
        if not verify_password(body.current_password, current_user.password_hash):
            raise HTTPException(400, "Password atual incorreta")
        current_user.password_hash = hash_password(body.new_password)

    if body.name is not None:
        current_user.name = body.name.strip() or None

    db.commit()
    db.refresh(current_user)
    return current_user


@router.get("/history", response_model=list[VideoHistoryItem])
def get_history(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    own_videos = (
        db.query(Video)
        .filter(Video.user_id == current_user.id, Video.status == "done")
        .all()
    )
    own_ids = {v.id for v in own_videos}

    participant_videos = (
        db.query(Video)
        .join(VideoParticipant, VideoParticipant.video_id == Video.id)
        .filter(VideoParticipant.user_id == current_user.id, Video.status == "done")
        .all()
    )

    items = [_extract_history_metrics(v, False) for v in own_videos]
    items += [_extract_history_metrics(v, True) for v in participant_videos if v.id not in own_ids]
    items.sort(key=lambda x: x.created_at, reverse=True)
    return items
