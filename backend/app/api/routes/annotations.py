from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.models.video import Video
from app.models.video_annotation import VideoAnnotation
from app.models.video_participant import VideoParticipant
from app.schemas.annotation import AnnotationResponse, CreateAnnotationRequest, UpdateAnnotationRequest, VALID_TAGS
from app.services.auth import get_current_user

router = APIRouter(prefix="/videos/{video_id}/annotations", tags=["annotations"])


def _can_access_video(video_id: str, user_id: str, db: Session) -> bool:
    """Verifica se o utilizador é dono ou participante do vídeo."""
    video = db.get(Video, video_id)
    if not video:
        return False
    if video.user_id == user_id:
        return True
    return (
        db.query(VideoParticipant)
        .filter(VideoParticipant.video_id == video_id, VideoParticipant.user_id == user_id)
        .first()
    ) is not None


def _build_response(ann: VideoAnnotation, replies: list[VideoAnnotation] | None = None) -> AnnotationResponse:
    """Constrói AnnotationResponse a partir do modelo, incluindo dados do autor."""
    return AnnotationResponse(
        id=ann.id,
        video_id=ann.video_id,
        author_id=ann.author_id,
        author_email=ann.author.email,
        author_name=ann.author.name,
        parent_id=ann.parent_id,
        content=ann.content,
        timestamp_s=ann.timestamp_s,
        court_x=ann.court_x,
        court_y=ann.court_y,
        tag=ann.tag,
        is_private=ann.is_private,
        created_at=ann.created_at,
        updated_at=ann.updated_at,
        replies=[_build_response(r) for r in (replies or ann.replies)],
    )


@router.get("", response_model=list[AnnotationResponse])
def list_annotations(
    video_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[AnnotationResponse]:
    """Lista todas as anotações de topo (sem pai) de um vídeo, com as respostas aninhadas."""
    if not _can_access_video(video_id, current_user.id, db):
        raise HTTPException(403, "Sem permissão para aceder a este vídeo")

    # Carregar todas as anotações de topo do vídeo
    top_level = (
        db.query(VideoAnnotation)
        .filter(
            VideoAnnotation.video_id == video_id,
            VideoAnnotation.parent_id.is_(None),
        )
        .all()
    )

    # Filtrar privadas: só o autor vê as suas próprias anotações privadas
    visible_top = [
        ann for ann in top_level
        if not ann.is_private or ann.author_id == current_user.id
    ]

    # Ordenar: timestamp_s ascendente (nulls no fim), depois created_at
    def sort_key(a: VideoAnnotation):
        ts = a.timestamp_s if a.timestamp_s is not None else float("inf")
        return (ts, a.created_at)

    visible_top.sort(key=sort_key)

    result = []
    for ann in visible_top:
        # Filtrar respostas privadas da mesma forma
        visible_replies = [
            r for r in ann.replies
            if not r.is_private or r.author_id == current_user.id
        ]
        visible_replies.sort(key=lambda r: r.created_at)
        result.append(_build_response(ann, visible_replies))

    return result


@router.post("", response_model=AnnotationResponse, status_code=201)
def create_annotation(
    video_id: str,
    body: CreateAnnotationRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AnnotationResponse:
    """Cria uma nova anotação num vídeo."""
    if not _can_access_video(video_id, current_user.id, db):
        raise HTTPException(403, "Sem permissão para anotar este vídeo")

    if not body.content.strip():
        raise HTTPException(400, "O conteúdo da anotação não pode estar vazio")

    if body.tag is not None and body.tag not in VALID_TAGS:
        raise HTTPException(400, f"Tag inválida. Valores aceites: {', '.join(sorted(VALID_TAGS))}")

    # Validar parent_id se fornecido
    if body.parent_id is not None:
        parent = db.get(VideoAnnotation, body.parent_id)
        if not parent or parent.video_id != video_id:
            raise HTTPException(404, "Anotação pai não encontrada")

    ann = VideoAnnotation(
        video_id=video_id,
        author_id=current_user.id,
        parent_id=body.parent_id,
        content=body.content.strip(),
        timestamp_s=body.timestamp_s,
        court_x=body.court_x,
        court_y=body.court_y,
        frame_x=body.frame_x,
        frame_y=body.frame_y,
        tag=body.tag,
        is_private=body.is_private,
    )
    db.add(ann)
    db.commit()
    db.refresh(ann)
    return _build_response(ann, [])


@router.patch("/{ann_id}", response_model=AnnotationResponse)
def update_annotation(
    video_id: str,
    ann_id: str,
    body: UpdateAnnotationRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AnnotationResponse:
    """Actualiza o conteúdo, tag ou visibilidade de uma anotação. Só o autor pode editar."""
    ann = db.get(VideoAnnotation, ann_id)
    if not ann or ann.video_id != video_id:
        raise HTTPException(404, "Anotação não encontrada")

    if ann.author_id != current_user.id:
        raise HTTPException(403, "Só o autor pode editar esta anotação")

    if body.content is not None:
        if not body.content.strip():
            raise HTTPException(400, "O conteúdo não pode estar vazio")
        ann.content = body.content.strip()

    if body.tag is not None:
        if body.tag not in VALID_TAGS:
            raise HTTPException(400, f"Tag inválida. Valores aceites: {', '.join(sorted(VALID_TAGS))}")
        ann.tag = body.tag

    if body.is_private is not None:
        ann.is_private = body.is_private

    from datetime import datetime, timezone
    ann.updated_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(ann)

    # Filtrar respostas visíveis
    visible_replies = [
        r for r in ann.replies
        if not r.is_private or r.author_id == current_user.id
    ]
    return _build_response(ann, visible_replies)


@router.delete("/{ann_id}", status_code=204)
def delete_annotation(
    video_id: str,
    ann_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    """Elimina uma anotação. Só o autor pode eliminar."""
    ann = db.get(VideoAnnotation, ann_id)
    if not ann or ann.video_id != video_id:
        raise HTTPException(404, "Anotação não encontrada")

    if ann.author_id != current_user.id:
        raise HTTPException(403, "Só o autor pode eliminar esta anotação")

    db.delete(ann)
    db.commit()
