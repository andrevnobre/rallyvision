from fastapi import FastAPI

from app.config import settings

app = FastAPI(
    title="RallyVision API",
    version="0.1.0",
    docs_url="/docs" if settings.environment != "production" else None,
)


@app.get("/health")
def health():
    return {"status": "ok", "environment": settings.environment}
