from fastapi import FastAPI

from app.config import settings
from app.database import Base, engine
from app.api.routes import videos

Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="BT Vision API",
    version="0.1.0",
    docs_url="/docs" if settings.environment != "production" else None,
)

app.include_router(videos.router)


@app.get("/health")
def health():
    return {"status": "ok", "environment": settings.environment}
