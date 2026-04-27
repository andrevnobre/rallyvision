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
    share_token: str | None = None

    model_config = {"from_attributes": True}


class SharedVideoResponse(BaseModel):
    id: str
    filename: str
    status: str
    created_at: datetime
    result: str | None = None

    model_config = {"from_attributes": True}


class ProcessRequest(BaseModel):
    court_roi: list[list[float]]           # [[nx, ny], ...] normalizados em [0, 1]
    camera_orientation: str | None = None  # "lateral" | "fundo" | None (auto-detecta)
    net_points: list[list[float]] | None = None  # [[nx, ny], [nx, ny]] extremos da rede

    @field_validator("court_roi")
    @classmethod
    def validate_roi(cls, v: list[list[float]]) -> list[list[float]]:
        if len(v) != 4:
            raise ValueError("court_roi deve ter exactamente 4 pontos")
        for pt in v:
            if len(pt) != 2:
                raise ValueError("Cada ponto deve ser [x, y]")
        return v

    @field_validator("net_points")
    @classmethod
    def validate_net(cls, v: list[list[float]] | None) -> list[list[float]] | None:
        if v is None:
            return v
        if len(v) != 2:
            raise ValueError("net_points deve ter exactamente 2 pontos")
        for pt in v:
            if len(pt) != 2:
                raise ValueError("Cada ponto deve ser [x, y]")
        return v

    @field_validator("camera_orientation")
    @classmethod
    def validate_orientation(cls, v: str | None) -> str | None:
        if v is not None and v not in ("lateral", "fundo"):
            raise ValueError("camera_orientation deve ser 'lateral' ou 'fundo'")
        return v
