from datetime import datetime

from pydantic import BaseModel

VALID_TAGS = {"tecnica", "posicionamento", "tatico", "mental"}


class CreateAnnotationRequest(BaseModel):
    content: str
    timestamp_s: float | None = None
    court_x: float | None = None
    court_y: float | None = None
    tag: str | None = None
    is_private: bool = False
    parent_id: str | None = None


class UpdateAnnotationRequest(BaseModel):
    content: str | None = None
    tag: str | None = None
    is_private: bool | None = None


class AnnotationResponse(BaseModel):
    id: str
    video_id: str
    author_id: str
    author_email: str
    author_name: str | None
    parent_id: str | None
    content: str
    timestamp_s: float | None
    court_x: float | None
    court_y: float | None
    tag: str | None
    is_private: bool
    created_at: datetime
    updated_at: datetime
    replies: list["AnnotationResponse"] = []

    model_config = {"from_attributes": True}
