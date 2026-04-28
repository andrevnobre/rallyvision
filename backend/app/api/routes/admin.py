from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.models.video import Video
from app.schemas.admin import (
    AdminMetricsResponse,
    AdminUserDetail,
    AdminUserResponse,
    AdminVideoResponse,
    AdminVideoSummary,
    PatchUserRequest,
    PlanCounts,
    StatusCounts,
)
from app.services.auth import require_admin
from app.services.storage import delete_video_files

router = APIRouter(prefix="/admin", tags=["admin"])


def _video_count(user_id: str, db: Session) -> int:
    return db.query(func.count(Video.id)).filter(Video.user_id == user_id).scalar() or 0


def _user_to_response(user: User, db: Session) -> AdminUserResponse:
    return AdminUserResponse(
        id=user.id,
        email=user.email,
        plan=user.plan,
        is_admin=user.is_admin,
        is_suspended=user.is_suspended,
        created_at=user.created_at,
        video_count=_video_count(user.id, db),
    )


def _video_to_response(video: Video, db: Session) -> AdminVideoResponse:
    user_email: str | None = None
    if video.user_id:
        owner = db.get(User, video.user_id)
        user_email = owner.email if owner else None
    return AdminVideoResponse(
        id=video.id,
        user_id=video.user_id,
        user_email=user_email,
        filename=video.filename,
        status=video.status,
        error=video.error,
        created_at=video.created_at,
        has_share_token=video.share_token is not None,
    )


# ── Users ────────────────────────────────────────────────────────────────────

@router.get("/users", response_model=list[AdminUserResponse])
def list_users(
    plan: str | None = None,
    page: int = 1,
    limit: int = 50,
    _admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    q = db.query(User)
    if plan:
        q = q.filter(User.plan == plan)
    users = q.order_by(User.created_at.desc()).offset((page - 1) * limit).limit(limit).all()
    return [_user_to_response(u, db) for u in users]


@router.get("/users/{user_id}", response_model=AdminUserDetail)
def get_user(
    user_id: str,
    _admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(404, "Utilizador não encontrado")
    base = _user_to_response(user, db)
    videos = (
        db.query(Video)
        .filter(Video.user_id == user_id)
        .order_by(Video.created_at.desc())
        .limit(20)
        .all()
    )
    return AdminUserDetail(
        **base.model_dump(),
        videos=[AdminVideoSummary.model_validate(v) for v in videos],
    )


@router.patch("/users/{user_id}", response_model=AdminUserResponse)
def patch_user(
    user_id: str,
    body: PatchUserRequest,
    _admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(404, "Utilizador não encontrado")
    if body.plan is not None:
        if body.plan not in ("free", "pro", "club"):
            raise HTTPException(400, "Plano inválido. Use: free, pro, club")
        user.plan = body.plan
    if body.is_suspended is not None:
        user.is_suspended = body.is_suspended
    db.commit()
    db.refresh(user)
    return _user_to_response(user, db)


# ── Videos ───────────────────────────────────────────────────────────────────

@router.get("/videos", response_model=list[AdminVideoResponse])
def list_videos(
    status: str | None = None,
    page: int = 1,
    limit: int = 50,
    _admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    q = db.query(Video)
    if status:
        q = q.filter(Video.status == status)
    videos = q.order_by(Video.created_at.desc()).offset((page - 1) * limit).limit(limit).all()
    return [_video_to_response(v, db) for v in videos]


@router.post("/videos/{video_id}/retry", status_code=202)
def retry_video(
    video_id: str,
    _admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    from app.config import settings
    from app.worker.tasks import process_video

    video = db.get(Video, video_id)
    if not video:
        raise HTTPException(404, "Vídeo não encontrado")
    if video.status != "failed":
        raise HTTPException(409, f"Só é possível re-enfileirar vídeos com status 'failed' (actual: {video.status})")

    video.status = "pending"
    video.error = None
    db.commit()

    if settings.launch_template_id:
        import json
        import boto3
        msg = {
            "video_id": video.id,
            "storage_key": video.storage_key,
            "court_roi": json.loads(video.court_roi) if video.court_roi else None,
            "camera_orientation": None,
            "net_points": json.loads(video.net_points) if video.net_points else None,
            "api_url": settings.internal_api_url,
            "api_key": settings.worker_api_key,
            "bucket": settings.s3_bucket,
        }
        sqs = boto3.client("sqs", region_name=settings.aws_region)
        sqs.send_message(QueueUrl=settings.sqs_url, MessageBody=json.dumps(msg))
    else:
        process_video.delay(video.id, video.storage_key)

    return {"status": "accepted"}


@router.delete("/videos/{video_id}", status_code=204)
def delete_video(
    video_id: str,
    _admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    video = db.get(Video, video_id)
    if not video:
        raise HTTPException(404, "Vídeo não encontrado")
    delete_video_files(video.storage_key)
    db.delete(video)
    db.commit()


# ── Metrics ──────────────────────────────────────────────────────────────────

@router.get("/metrics", response_model=AdminMetricsResponse)
def get_metrics(
    _admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    users_total = db.query(func.count(User.id)).scalar() or 0

    plan_rows = db.query(User.plan, func.count(User.id)).group_by(User.plan).all()
    plan_map = {p: c for p, c in plan_rows}

    videos_total = db.query(func.count(Video.id)).scalar() or 0

    status_rows = db.query(Video.status, func.count(Video.id)).group_by(Video.status).all()
    status_map = {s: c for s, c in status_rows}

    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    videos_today = (
        db.query(func.count(Video.id)).filter(Video.created_at >= today_start).scalar() or 0
    )

    errors_active = status_map.get("failed", 0)

    return AdminMetricsResponse(
        users_total=users_total,
        by_plan=PlanCounts(
            free=plan_map.get("free", 0),
            pro=plan_map.get("pro", 0),
            club=plan_map.get("club", 0),
        ),
        videos_total=videos_total,
        by_status=StatusCounts(
            pending_roi=status_map.get("pending_roi", 0),
            pending=status_map.get("pending", 0),
            queued=status_map.get("queued", 0),
            processing=status_map.get("processing", 0),
            done=status_map.get("done", 0),
            failed=status_map.get("failed", 0),
        ),
        videos_today=videos_today,
        errors_active=errors_active,
    )
