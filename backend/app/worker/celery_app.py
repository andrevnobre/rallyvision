from celery import Celery

from app.config import settings

celery_app = Celery(
    "rallyvision",
    broker=settings.redis_url,
    backend=settings.redis_url,
    include=["app.worker.tasks"],
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    task_track_started=True,
    task_acks_late=True,          # reencaminha job se o worker morrer a meio
    worker_prefetch_multiplier=1, # um job de cada vez (vídeos são pesados)
)
