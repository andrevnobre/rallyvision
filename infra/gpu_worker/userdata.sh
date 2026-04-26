#!/bin/bash
# EC2 userdata: bootstrap rallyvision GPU worker
# Deep Learning AMI (Amazon Linux 2023) — PyTorch em /opt/pytorch/
set -uo pipefail

LOG=/var/log/rallyvision-worker.log
exec > >(tee -a "$LOG") 2>&1

echo "=== $(date -u +%Y-%m-%dT%H:%M:%SZ) Rallyvision GPU Worker Bootstrap ==="

BUCKET="rallyvision-videos"
REGION="eu-west-1"
SQS_URL="https://sqs.eu-west-1.amazonaws.com/124839183927/rallyvision-jobs"
MODELS_DIR="/opt/models"
WORKER_DIR="/opt/worker"

mkdir -p "$MODELS_DIR" "$WORKER_DIR"

# ── Encontrar Python com PyTorch ──────────────────────────────────────────────
# No AMI "Deep Learning OSS Nvidia Driver AMI GPU PyTorch" (AL2023),
# o Python+PyTorch está em /opt/pytorch/bin/
PYTHON=""

# Candidatos em ordem de preferência
for P in \
    /opt/pytorch/bin/python3 \
    /opt/pytorch/bin/python \
    /opt/conda/envs/pytorch/bin/python3 \
    /home/ec2-user/anaconda3/envs/pytorch/bin/python3; do
    if [ -x "$P" ] && "$P" -c "import torch" 2>/dev/null; then
        PYTHON="$P"
        break
    fi
done

# Fallback: qualquer Python com torch encontrado via find
if [ -z "$PYTHON" ]; then
    TORCH_INIT=$(find /opt -maxdepth 8 -path "*/torch/__init__.py" 2>/dev/null | grep -v compat | head -1)
    if [ -n "$TORCH_INIT" ]; then
        SITE_PKG=$(dirname "$(dirname "$TORCH_INIT")")        # .../site-packages
        LIB_DIR=$(dirname "$SITE_PKG")                        # .../lib/python3.X
        BIN_DIR=$(dirname "$(dirname "$LIB_DIR")")/bin        # .../bin
        for P in "$BIN_DIR/python3" "$BIN_DIR/python"; do
            [ -x "$P" ] && "$P" -c "import torch" 2>/dev/null && PYTHON="$P" && break || true
        done
    fi
fi

if [ -z "$PYTHON" ]; then
    echo "ERRO: Python com PyTorch não encontrado. A sair."
    exit 1
fi

echo "Python: $PYTHON ($($PYTHON --version 2>&1))"
$PYTHON -c "import torch; print('PyTorch', torch.__version__, '| CUDA:', torch.cuda.is_available())"

# ── Instalar deps extras ───────────────────────────────────────────────────────
echo "Instalando ultralytics, opencv, httpx, boto3..."
$PYTHON -m pip install -q --upgrade ultralytics opencv-python-headless httpx requests boto3 2>&1 | tail -3

# ── Download do S3 ─────────────────────────────────────────────────────────────
echo "A descarregar worker scripts de S3..."
aws s3 cp "s3://${BUCKET}/worker/gpu_worker.py" "${WORKER_DIR}/gpu_worker.py" --region "$REGION"
aws s3 cp "s3://${BUCKET}/worker/pipeline.py"   "${WORKER_DIR}/pipeline.py"   --region "$REGION"

echo "A descarregar pesos ML de S3..."
aws s3 cp "s3://${BUCKET}/models/ball_yolo.pt" "${MODELS_DIR}/ball_yolo.pt" --region "$REGION"
aws s3 cp "s3://${BUCKET}/models/yolov8s.pt"  "${MODELS_DIR}/yolov8s.pt"  --region "$REGION"

echo "Assets prontos — a arrancar worker..."
ls -lh "$MODELS_DIR"

# ── Arrancar worker ────────────────────────────────────────────────────────────
cd "$WORKER_DIR"
SQS_URL="$SQS_URL" \
  AWS_REGION="$REGION" \
  MODELS_DIR="$MODELS_DIR" \
  IDLE_TIMEOUT_S="300" \
  $PYTHON gpu_worker.py >> "$LOG" 2>&1

echo "=== Worker terminou em $(date -u +%Y-%m-%dT%H:%M:%SZ) ==="
