import uuid
from pathlib import Path

import boto3
from botocore.exceptions import ClientError

from app.config import settings

LOCAL_UPLOAD_DIR = Path("/uploads")


def _use_s3() -> bool:
    return bool(settings.aws_access_key_id and settings.aws_secret_access_key)


def upload_video(file_bytes: bytes, original_filename: str) -> str:
    """
    Guarda o vídeo e devolve a storage_key.
    Em dev (sem credenciais AWS) guarda em disco local.
    Em prod guarda no S3.
    """
    ext = Path(original_filename).suffix.lower()
    key = f"videos/{uuid.uuid4()}{ext}"

    if _use_s3():
        s3 = boto3.client(
            "s3",
            region_name=settings.aws_region,
            aws_access_key_id=settings.aws_access_key_id,
            aws_secret_access_key=settings.aws_secret_access_key,
        )
        s3.put_object(Bucket=settings.s3_bucket, Key=key, Body=file_bytes)
    else:
        # fallback local para desenvolvimento
        dest = LOCAL_UPLOAD_DIR / key
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(file_bytes)

    return key


def get_local_path(storage_key: str) -> Path:
    """Devolve o caminho local do ficheiro (só válido em dev)."""
    return LOCAL_UPLOAD_DIR / storage_key


def download_video(storage_key: str, dest_path: Path) -> None:
    """Faz download do vídeo para um caminho local (usado pelo worker)."""
    if _use_s3():
        s3 = boto3.client(
            "s3",
            region_name=settings.aws_region,
            aws_access_key_id=settings.aws_access_key_id,
            aws_secret_access_key=settings.aws_secret_access_key,
        )
        s3.download_file(settings.s3_bucket, storage_key, str(dest_path))
    else:
        import shutil
        shutil.copy2(LOCAL_UPLOAD_DIR / storage_key, dest_path)
