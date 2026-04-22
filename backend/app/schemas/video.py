from datetime import datetime

from pydantic import BaseModel


class VideoUploadResponse(BaseModel):
    id: str
    filename: str
    status: str
    created_at: datetime

    model_config = {"from_attributes": True}


class VideoStatusResponse(BaseModel):
    id: str
    filename: str
    status: str
    created_at: datetime
    error: str | None = None
    result: str | None = None

    model_config = {"from_attributes": True}
