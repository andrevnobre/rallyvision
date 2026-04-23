from datetime import datetime

from pydantic import BaseModel, field_validator


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


class ProcessRequest(BaseModel):
    court_roi: list[list[float]]  # [[nx, ny], ...] normalizados em [0, 1]

    @field_validator("court_roi")
    @classmethod
    def validate_roi(cls, v: list[list[float]]) -> list[list[float]]:
        if len(v) != 4:
            raise ValueError("court_roi deve ter exactamente 4 pontos")
        for pt in v:
            if len(pt) != 2:
                raise ValueError("Cada ponto deve ser [x, y]")
        return v
