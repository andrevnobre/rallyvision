import logging

from app.worker.celery_app import celery_app

logger = logging.getLogger(__name__)


@celery_app.task(bind=True, name="process_video")
def process_video(self, video_id: str, s3_key: str):
    """
    Job principal de análise de vídeo.
    Recebe o ID do vídeo e a chave S3, executa o pipeline de IA,
    e guarda os resultados na base de dados.
    """
    logger.info(f"[{video_id}] Iniciando processamento — s3://{s3_key}")
    self.update_state(state="STARTED", meta={"video_id": video_id, "progress": 0})

    # TODO: implementar pipeline
    # 1. Download do vídeo do S3
    # 2. Executar combined_spike.py (detecção bola + jogadores)
    # 3. Extrair stats (rallies, heatmaps, posicionamento)
    # 4. Guardar resultados na DB
    # 5. Apagar vídeo local

    logger.info(f"[{video_id}] Processamento concluído")
    return {"video_id": video_id, "status": "done"}
