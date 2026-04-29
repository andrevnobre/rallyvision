from datetime import datetime

from pydantic import BaseModel


class UpdateProfileRequest(BaseModel):
    name: str | None = None
    current_password: str | None = None
    new_password: str | None = None


class ProfileResponse(BaseModel):
    id: str
    email: str
    name: str | None
    plan: str
    is_admin: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class VideoHistoryItem(BaseModel):
    id: str
    filename: str
    created_at: datetime
    rally_count: int | None
    avg_rally_duration_s: float | None
    ball_detection_pct: float | None
    duration_s: float | None
    is_participant: bool

    model_config = {"from_attributes": True}
