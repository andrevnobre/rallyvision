import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Video(Base):
    __tablename__ = "videos"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id"), nullable=True, index=True)
    filename: Mapped[str] = mapped_column(String(255))
    storage_key: Mapped[str] = mapped_column(String(512))
    status: Mapped[str] = mapped_column(String(20), default="pending_roi")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )
    court_roi: Mapped[str | None] = mapped_column(Text, nullable=True)   # JSON [[nx,ny],...]
    net_points: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON [[nx,ny],[nx,ny]]
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    result: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON
    owner: Mapped["User | None"] = relationship("User", back_populates="videos")  # type: ignore[name-defined]
