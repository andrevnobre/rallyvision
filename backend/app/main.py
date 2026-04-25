from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import Base, engine
from app.models import User, Video  # noqa: F401 — garante que create_all vê todos os modelos
from app.api.routes import videos
from app.api.routes.auth import router as auth_router

Base.metadata.create_all(bind=engine)

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
app.include_router(videos.router)


@app.get("/health")
def health():
    return {"status": "ok", "environment": settings.environment}
