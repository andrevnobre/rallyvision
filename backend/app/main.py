from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.config import settings
from app.database import Base, engine
from app.models import User, Video, CoachPlayer, VideoParticipant  # noqa: F401 — garante que create_all vê todos os modelos
from app.api.routes import videos
from app.api.routes.admin import router as admin_router
from app.api.routes.auth import router as auth_router
from app.api.routes.coach import router as coach_router
from app.api.routes.internal import router as internal_router
from app.api.routes.profile import router as profile_router

Base.metadata.create_all(bind=engine)

with engine.connect() as _conn:
    _conn.execute(text(
        "ALTER TABLE videos ADD COLUMN IF NOT EXISTS share_token VARCHAR(36) NULL UNIQUE"
    ))
    _conn.execute(text(
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT FALSE"
    ))
    _conn.execute(text(
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS is_suspended BOOLEAN NOT NULL DEFAULT FALSE"
    ))
    _conn.execute(text(
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS name VARCHAR(255) NULL"
    ))
    _conn.execute(text("UPDATE users SET plan = 'pro' WHERE plan = 'free'"))
    if settings.admin_email:
        _conn.execute(
            text("UPDATE users SET is_admin = TRUE WHERE email = :e"),
            {"e": settings.admin_email},
        )
    _conn.commit()

app = FastAPI(
    title="BT Vision API",
    version="0.1.0",
    docs_url="/docs" if settings.environment != "production" else None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(profile_router)
app.include_router(coach_router)
app.include_router(videos.router)
app.include_router(internal_router)
app.include_router(admin_router)


@app.get("/health")
def health():
    return {"status": "ok", "environment": settings.environment}
