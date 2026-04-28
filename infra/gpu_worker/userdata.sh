#!/bin/bash
# EC2 userdata: bootstrap rallyvision GPU worker
# Idempotente: salta pip install e download de modelos se AMI já os tiver pré-instalados.
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
PYTHON=""

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

if [ -z "$PYTHON" ]; then
    TORCH_INIT=$(find /opt -maxdepth 8 -path "*/torch/__init__.py" 2>/dev/null | grep -v compat | head -1)
    if [ -n "$TORCH_INIT" ]; then
        SITE_PKG=$(dirname "$(dirname "$TORCH_INIT")")
        LIB_DIR=$(dirname "$SITE_PKG")
        BIN_DIR=$(dirname "$(dirname "$LIB_DIR")")/bin
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

# ── Instalar deps (skip se AMI pré-baked) ─────────────────────────────────────
if $PYTHON -c "import ultralytics, cv2, httpx" 2>/dev/null; then
    echo "Deps já instaladas (AMI pré-baked) — a saltar pip install"
else
    echo "Instalando ultralytics, opencv, httpx, boto3..."
    $PYTHON -m pip install -q --upgrade ultralytics opencv-python-headless httpx requests boto3 2>&1 | tail -5
fi

# ── Worker scripts (sempre atualizados do S3) ──────────────────────────────────
echo "A descarregar worker scripts de S3..."
aws s3 cp "s3://${BUCKET}/worker/gpu_worker.py" "${WORKER_DIR}/gpu_worker.py" --region "$REGION"
aws s3 cp "s3://${BUCKET}/worker/pipeline.py"   "${WORKER_DIR}/pipeline.py"   --region "$REGION"

# ── Pesos ML (skip se já existem — pré-baked na AMI) ──────────────────────────
echo "A verificar pesos ML..."
if [ -f "${MODELS_DIR}/ball_yolo.pt" ]; then
    echo "  ball_yolo.pt já presente (AMI pré-baked)"
else
    echo "  A descarregar ball_yolo.pt..."
    aws s3 cp "s3://${BUCKET}/models/ball_yolo.pt" "${MODELS_DIR}/ball_yolo.pt" --region "$REGION"
fi

if [ -f "${MODELS_DIR}/yolov8s.pt" ]; then
    echo "  yolov8s.pt já presente (AMI pré-baked)"
else
    echo "  A descarregar yolov8s.pt..."
    aws s3 cp "s3://${BUCKET}/models/yolov8s.pt" "${MODELS_DIR}/yolov8s.pt" --region "$REGION"
fi

echo "Assets prontos:"
ls -lh "$MODELS_DIR"

# ── Arrancar worker ────────────────────────────────────────────────────────────
echo "=== $(date -u +%Y-%m-%dT%H:%M:%SZ) A arrancar worker ==="
cd "$WORKER_DIR"
SQS_URL="$SQS_URL" \
  AWS_REGION="$REGION" \
  MODELS_DIR="$MODELS_DIR" \
  IDLE_TIMEOUT_S="300" \
  $PYTHON gpu_worker.py >> "$LOG" 2>&1

echo "=== Worker terminou em $(date -u +%Y-%m-%dT%H:%M:%SZ) ==="
