import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class VideoAnnotation(Base):
    __tablename__ = "video_annotations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    video_id: Mapped[str] = mapped_column(String(36), ForeignKey("videos.id"), index=True)
    author_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), index=True)
    parent_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("video_annotations.id"), nullable=True)
    content: Mapped[str] = mapped_column(Text)
    timestamp_s: Mapped[float | None] = mapped_column(Float, nullable=True)
    court_x: Mapped[float | None] = mapped_column(Float, nullable=True)
    court_y: Mapped[float | None] = mapped_column(Float, nullable=True)
    frame_x: Mapped[float | None] = mapped_column(Float, nullable=True)   # normalizado 0-1 pela largura do frame
    frame_y: Mapped[float | None] = mapped_column(Float, nullable=True)   # normalizado 0-1 pela altura do frame
    tag: Mapped[str | None] = mapped_column(String(20), nullable=True)  # tecnica|posicionamento|tatico|mental
    is_private: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    author: Mapped["User"] = relationship("User")  # type: ignore
    replies: Mapped[list["VideoAnnotation"]] = relationship("VideoAnnotation", foreign_keys=[parent_id])
