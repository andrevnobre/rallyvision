import shutil
import tempfile
import uuid
from pathlib import Path

import boto3
from botocore.exceptions import ClientError

from app.config import settings

LOCAL_UPLOAD_DIR = Path("/uploads")

_VIDEO_CONTENT_TYPES = {
    ".mp4": "video/mp4",
    ".mov": "video/quicktime",
    ".avi": "video/x-msvideo",
    ".mkv": "video/x-matroska",
}


def _use_s3() -> bool:
    return bool(settings.aws_access_key_id and settings.aws_secret_access_key)


def _s3():
    return boto3.client(
        "s3",
        region_name=settings.aws_region,
        aws_access_key_id=settings.aws_access_key_id,
        aws_secret_access_key=settings.aws_secret_access_key,
    )


def _thumb_key(video_storage_key: str) -> str:
    return f"thumbnails/{Path(video_storage_key).stem}.jpg"


def upload_video(file_bytes: bytes, original_filename: str) -> str:
    ext = Path(original_filename).suffix.lower()
    key = f"videos/{uuid.uuid4()}{ext}"

    if _use_s3():
        _s3().put_object(
            Bucket=settings.s3_bucket,
            Key=key,
            Body=file_bytes,
            ContentType=_VIDEO_CONTENT_TYPES.get(ext, "video/mp4"),
        )
    else:
        dest = LOCAL_UPLOAD_DIR / key
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(file_bytes)

    return key


_CHUNK = 8 * 1024 * 1024       # 8 MB por chunk (mínimo S3 exceto última parte)
_THUMB_CAPTURE = 5 * 1024 * 1024  # primeiros 5 MB captados para thumbnail


async def stream_and_store(file, original_filename: str, max_bytes: int) -> tuple[str, bytes]:
    """
    Faz upload do vídeo em chunks sem carregar o ficheiro completo em RAM.
    Usa S3 Multipart Upload em produção e escrita incremental em disco em dev.
    Devolve (storage_key, primeiros_bytes) para geração de thumbnail.
    """
    ext = Path(original_filename).suffix.lower()
    key = f"videos/{uuid.uuid4()}{ext}"
    content_type = _VIDEO_CONTENT_TYPES.get(ext, "video/mp4")

    first_bytes: bytearray = bytearray()
    total = 0

    if _use_s3():
        s3c = _s3()
        mpu = s3c.create_multipart_upload(
            Bucket=settings.s3_bucket, Key=key, ContentType=content_type
        )
        upload_id = mpu["UploadId"]
        parts: list[dict] = []
        part_num = 1

        try:
            while True:
                chunk = await file.read(_CHUNK)
                if not chunk:
                    break
                total += len(chunk)
                if total > max_bytes:
                    raise ValueError("Vídeo demasiado grande")
                if len(first_bytes) < _THUMB_CAPTURE:
                    first_bytes.extend(chunk[: _THUMB_CAPTURE - len(first_bytes)])
                resp = s3c.upload_part(
                    Bucket=settings.s3_bucket,
                    Key=key,
                    UploadId=upload_id,
                    PartNumber=part_num,
                    Body=chunk,
                )
                parts.append({"PartNumber": part_num, "ETag": resp["ETag"]})
                part_num += 1

            s3c.complete_multipart_upload(
                Bucket=settings.s3_bucket,
                Key=key,
                UploadId=upload_id,
                MultipartUpload={"Parts": parts},
            )
        except Exception:
            s3c.abort_multipart_upload(
                Bucket=settings.s3_bucket, Key=key, UploadId=upload_id
            )
            raise
    else:
        dest = LOCAL_UPLOAD_DIR / key
        dest.parent.mkdir(parents=True, exist_ok=True)
        with dest.open("wb") as fout:
            while True:
                chunk = await file.read(_CHUNK)
                if not chunk:
                    break
                total += len(chunk)
                if total > max_bytes:
                    dest.unlink(missing_ok=True)
                    raise ValueError("Vídeo demasiado grande")
                if len(first_bytes) < _THUMB_CAPTURE:
                    first_bytes.extend(chunk[: _THUMB_CAPTURE - len(first_bytes)])
                fout.write(chunk)

    return key, bytes(first_bytes)


def upload_thumbnail(video_bytes: bytes, video_storage_key: str) -> None:
    """Extrai o primeiro frame do vídeo e guarda como thumbnail JPEG."""
    import cv2
    import numpy as np

    ext = Path(video_storage_key).suffix.lower()
    with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp:
        tmp.write(video_bytes)
        tmp_path = Path(tmp.name)

    try:
        cap = cv2.VideoCapture(str(tmp_path))
        ret, frame = cap.read()
        cap.release()
        if not ret:
            return

        _, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
        jpeg = buf.tobytes()
        thumb_key = _thumb_key(video_storage_key)

        if _use_s3():
            _s3().put_object(
                Bucket=settings.s3_bucket,
                Key=thumb_key,
                Body=jpeg,
                ContentType="image/jpeg",
            )
        else:
            dest = LOCAL_UPLOAD_DIR / thumb_key
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes(jpeg)
    finally:
        tmp_path.unlink(missing_ok=True)


def get_thumbnail_jpeg(video_storage_key: str) -> bytes | None:
    """Devolve os bytes JPEG do thumbnail pré-gerado, ou None se não existir."""
    thumb_key = _thumb_key(video_storage_key)
    if _use_s3():
        try:
            obj = _s3().get_object(Bucket=settings.s3_bucket, Key=thumb_key)
            return obj["Body"].read()
        except ClientError:
            return None
    else:
        path = LOCAL_UPLOAD_DIR / thumb_key
        return path.read_bytes() if path.exists() else None


def get_local_path(storage_key: str) -> Path:
    return LOCAL_UPLOAD_DIR / storage_key


def get_presigned_url(storage_key: str, expires: int = 3600) -> str | None:
    """Gera URL pré-assinada para acesso direto ao S3. Retorna None em dev."""
    if not _use_s3():
        return None
    return _s3().generate_presigned_url(
        "get_object",
        Params={"Bucket": settings.s3_bucket, "Key": storage_key},
        ExpiresIn=expires,
    )


def download_video(storage_key: str, dest_path: Path) -> None:
    """Faz download do vídeo para caminho local (usado pelo worker)."""
    if _use_s3():
        _s3().download_file(settings.s3_bucket, storage_key, str(dest_path))
    else:
        shutil.copy2(LOCAL_UPLOAD_DIR / storage_key, dest_path)
