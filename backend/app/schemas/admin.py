from datetime import datetime

from pydantic import BaseModel


class CoachFeedbackResponse(BaseModel):
    id: str
    name: str | None
    email: str | None
    text_feedback: str | None
    audio_mime: str | None
    has_audio: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class AdminVideoSummary(BaseModel):
    id: str
    filename: str
    status: str
    error: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class AdminUserResponse(BaseModel):
    id: str
    email: str
    plan: str
    is_admin: bool
    is_suspended: bool
    created_at: datetime
    video_count: int

    model_config = {"from_attributes": True}


class AdminUserDetail(AdminUserResponse):
    videos: list[AdminVideoSummary]


class PatchUserRequest(BaseModel):
    plan: str | None = None
    is_suspended: bool | None = None


class AdminVideoResponse(BaseModel):
    id: str
    user_id: str | None
    user_email: str | None
    filename: str
    status: str
    error: str | None
    created_at: datetime
    has_share_token: bool

    model_config = {"from_attributes": True}


class PlanCounts(BaseModel):
    free: int
    pro: int
    club: int


class StatusCounts(BaseModel):
    pending_roi: int
    pending: int
    queued: int
    processing: int
    done: int
    failed: int


class AdminMetricsResponse(BaseModel):
    users_total: int
    by_plan: PlanCounts
    videos_total: int
    by_status: StatusCounts
    videos_today: int
    errors_active: int
