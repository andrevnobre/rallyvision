import json

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.coach_player import CoachPlayer
from app.models.user import User
from app.models.video import Video
from app.models.video_participant import VideoParticipant
from app.schemas.coach import AddPlayerRequest, CoachPlayerItem, PlayerStatsResponse
from app.schemas.profile import VideoHistoryItem
from app.services.auth import get_current_user

router = APIRouter(prefix="/coach", tags=["coach"])

COACH_PLANS = {"pro", "club"}


def _require_coach(current_user: User = Depends(get_current_user)) -> User:
    if current_user.plan not in COACH_PLANS:
        raise HTTPException(403, "Dashboard de coach disponível para planos Pro e Club")
    return current_user


def _player_videos(player_id: str, db: Session) -> list[Video]:
    own = (
        db.query(Video)
        .filter(Video.user_id == player_id, Video.status == "done")
        .all()
    )
    own_ids = {v.id for v in own}
    as_participant = (
        db.query(Video)
        .join(VideoParticipant, VideoParticipant.video_id == Video.id)
        .filter(VideoParticipant.user_id == player_id, Video.status == "done")
        .all()
    )
    all_videos = own + [v for v in as_participant if v.id not in own_ids]
    all_videos.sort(key=lambda v: v.created_at, reverse=True)
    return all_videos


def _extract_metrics(video: Video) -> dict:
    if not video.result:
        return {}
    try:
        return json.loads(video.result)
    except (json.JSONDecodeError, AttributeError):
        return {}


@router.get("/players", response_model=list[CoachPlayerItem])
def list_players(
    current_user: User = Depends(_require_coach),
    db: Session = Depends(get_db),
):
    rows = db.query(CoachPlayer).filter(CoachPlayer.coach_id == current_user.id).all()
    result = []
    for row in rows:
        player = db.get(User, row.player_id)
        if not player:
            continue
        video_count = len(_player_videos(player.id, db))
        result.append(CoachPlayerItem(
            player_id=player.id,
            player_email=player.email,
            player_name=player.name,
            linked_at=row.created_at,
            video_count=video_count,
        ))
    return result


@router.post("/players", response_model=CoachPlayerItem, status_code=201)
def add_player(
    body: AddPlayerRequest,
    current_user: User = Depends(_require_coach),
    db: Session = Depends(get_db),
):
    if body.email == current_user.email:
        raise HTTPException(400, "Não pode adicionar-se a si próprio como aluno")

    player = db.query(User).filter(User.email == body.email).first()
    if not player:
        raise HTTPException(404, "Utilizador não encontrado com esse email")

    existing = (
        db.query(CoachPlayer)
        .filter(CoachPlayer.coach_id == current_user.id, CoachPlayer.player_id == player.id)
        .first()
    )
    if existing:
        raise HTTPException(409, "Aluno já está associado a este coach")

    link = CoachPlayer(coach_id=current_user.id, player_id=player.id)
    db.add(link)
    db.commit()
    db.refresh(link)

    return CoachPlayerItem(
        player_id=player.id,
        player_email=player.email,
        player_name=player.name,
        linked_at=link.created_at,
        video_count=0,
    )


@router.delete("/players/{player_id}", status_code=204)
def remove_player(
    player_id: str,
    current_user: User = Depends(_require_coach),
    db: Session = Depends(get_db),
):
    link = (
        db.query(CoachPlayer)
        .filter(CoachPlayer.coach_id == current_user.id, CoachPlayer.player_id == player_id)
        .first()
    )
    if not link:
        raise HTTPException(404, "Aluno não encontrado neste dashboard")
    db.delete(link)
    db.commit()


@router.get("/players/{player_id}", response_model=PlayerStatsResponse)
def get_player(
    player_id: str,
    current_user: User = Depends(_require_coach),
    db: Session = Depends(get_db),
):
    link = (
        db.query(CoachPlayer)
        .filter(CoachPlayer.coach_id == current_user.id, CoachPlayer.player_id == player_id)
        .first()
    )
    if not link:
        raise HTTPException(404, "Aluno não encontrado neste dashboard")

    player = db.get(User, player_id)
    if not player:
        raise HTTPException(404, "Utilizador não encontrado")

    videos = _player_videos(player_id, db)
    metrics = [_extract_metrics(v) for v in videos]

    rally_counts = [m["rally_count"] for m in metrics if "rally_count" in m]
    ball_pcts = [m["ball_detection_pct"] for m in metrics if "ball_detection_pct" in m]

    return PlayerStatsResponse(
        player_id=player.id,
        player_email=player.email,
        player_name=player.name,
        linked_at=link.created_at,
        total_videos=len(videos),
        avg_rally_count=sum(rally_counts) / len(rally_counts) if rally_counts else None,
        avg_ball_detection_pct=sum(ball_pcts) / len(ball_pcts) if ball_pcts else None,
    )


@router.get("/players/{player_id}/videos", response_model=list[VideoHistoryItem])
def get_player_videos(
    player_id: str,
    current_user: User = Depends(_require_coach),
    db: Session = Depends(get_db),
):
    link = (
        db.query(CoachPlayer)
        .filter(CoachPlayer.coach_id == current_user.id, CoachPlayer.player_id == player_id)
        .first()
    )
    if not link:
        raise HTTPException(404, "Aluno não encontrado neste dashboard")

    from app.api.routes.profile import _extract_history_metrics
    own_ids = {
        v.id for v in db.query(Video).filter(Video.user_id == player_id).all()
    }
    videos = _player_videos(player_id, db)
    return [_extract_history_metrics(v, v.id not in own_ids) for v in videos]
