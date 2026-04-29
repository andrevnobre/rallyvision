from datetime import datetime

from pydantic import BaseModel, EmailStr


class AddPlayerRequest(BaseModel):
    email: EmailStr


class CoachPlayerItem(BaseModel):
    player_id: str
    player_email: str
    player_name: str | None
    linked_at: datetime
    video_count: int

    model_config = {"from_attributes": True}


class PlayerStatsResponse(BaseModel):
    player_id: str
    player_email: str
    player_name: str | None
    linked_at: datetime
    total_videos: int
    avg_rally_count: float | None
    avg_ball_detection_pct: float | None


class AddParticipantsRequest(BaseModel):
    emails: list[EmailStr]


class ParticipantItem(BaseModel):
    user_id: str
    email: str
    name: str | None

    model_config = {"from_attributes": True}
