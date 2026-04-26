#!/bin/bash
# EC2 userdata: bootstrap rallyvision GPU worker
# Deep Learning AMI (Amazon Linux 2023 + NVIDIA drivers + PyTorch)
# Nota: NÃO usa set -e para sobreviver a falhas na descoberta do Python
set -uo pipefail

LOG=/var/log/rallyvision-worker.log
exec > >(tee -a "$LOG") 2>&1

echo "=== $(date -u +%Y-%m-%dT%H:%M:%SZ) Rallyvision GPU Worker Bootstrap ==="
echo "OS: $(grep PRETTY /etc/os-release 2>/dev/null | cut -d= -f2 | tr -d '\"' || echo unknown)"
echo "Path: $PATH"

BUCKET="rallyvision-videos"
REGION="eu-west-1"
SQS_URL="https://sqs.eu-west-1.amazonaws.com/124839183927/rallyvision-jobs"
MODELS_DIR="/opt/models"
WORKER_DIR="/opt/worker"

mkdir -p "$MODELS_DIR" "$WORKER_DIR"

# ── Diagnóstico: o que está instalado ─────────────────────────────────────────
echo "=== Python candidates ==="
find /opt /home /usr -maxdepth 8 -name "python3*" -type f 2>/dev/null | head -20 || true
echo "=== PyTorch locations ==="
find /opt /home /usr -maxdepth 10 -path "*/torch/__init__.py" 2>/dev/null | head -10 || true
echo "=== Conda envs ==="
find /opt /home /usr -maxdepth 6 -name "conda.sh" 2>/dev/null | head -10 || true

# ── Encontrar Python com PyTorch ──────────────────────────────────────────────
PYTHON=""

# 1. Procurar qualquer Python que já tenha torch instalado
for P in $(find /opt /home /usr -maxdepth 8 -name "python3" -type f 2>/dev/null | head -30); do
    if "$P" -c "import torch" 2>/dev/null; then
        PYTHON="$P"
        echo "Found Python+PyTorch at: $PYTHON"
        break
    fi
done

# 2. Tentar activar conda e procurar de novo
if [ -z "$PYTHON" ]; then
    for CONDA_SH in \
        /opt/conda/etc/profile.d/conda.sh \
        /home/ec2-user/anaconda3/etc/profile.d/conda.sh \
        /opt/dlami/nvme/miniconda3/etc/profile.d/conda.sh; do
        if [ -f "$CONDA_SH" ]; then
            source "$CONDA_SH" 2>/dev/null || true
            conda activate pytorch 2>/dev/null || conda activate base 2>/dev/null || true
            PYTHON=$(which python3 2>/dev/null || which python 2>/dev/null || echo "")
            [ -n "$PYTHON" ] && "$PYTHON" -c "import torch" 2>/dev/null && break || PYTHON=""
        fi
    done
fi

# 3. Usar system python3 (mesmo sem torch, instalaremos via pip)
if [ -z "$PYTHON" ]; then
    PYTHON=$(which python3 2>/dev/null || which python 2>/dev/null || echo "")
    if [ -z "$PYTHON" ]; then
        echo "Instalando python3 via dnf..."
        dnf install -y python3 python3-pip 2>&1 | tail -5
        PYTHON=$(which python3)
    fi
    echo "Usando system Python (sem torch pré-instalado): $PYTHON"
fi

echo "Python final: $PYTHON ($($PYTHON --version 2>&1))"

# ── Instalar deps ──────────────────────────────────────────────────────────────
echo "Instalando deps..."
if ! $PYTHON -c "import torch; assert torch.cuda.is_available()" 2>/dev/null; then
    echo "PyTorch CUDA não encontrado — a instalar (demora ~5min)..."
    $PYTHON -m pip install -q torch torchvision --index-url https://download.pytorch.org/whl/cu121 2>&1 | tail -5
fi
$PYTHON -m pip install -q --upgrade ultralytics opencv-python-headless httpx requests boto3 2>&1 | tail -5

echo "Verificação final:"
$PYTHON -c "import torch; print('PyTorch', torch.__version__, '| CUDA:', torch.cuda.is_available())"

# ── Download do S3 ─────────────────────────────────────────────────────────────
echo "A descarregar worker + pesos de S3..."
aws s3 cp "s3://${BUCKET}/worker/gpu_worker.py" "${WORKER_DIR}/gpu_worker.py" --region "$REGION"
aws s3 cp "s3://${BUCKET}/worker/pipeline.py"   "${WORKER_DIR}/pipeline.py"   --region "$REGION"
aws s3 cp "s3://${BUCKET}/models/ball_yolo.pt" "${MODELS_DIR}/ball_yolo.pt" --region "$REGION"
aws s3 cp "s3://${BUCKET}/models/yolov8s.pt"  "${MODELS_DIR}/yolov8s.pt"  --region "$REGION"

echo "Assets prontos:"
ls -lh "$MODELS_DIR" "$WORKER_DIR"

# ── Arrancar worker ────────────────────────────────────────────────────────────
echo "A arrancar GPU worker..."
cd "$WORKER_DIR"
SQS_URL="$SQS_URL" \
  AWS_REGION="$REGION" \
  MODELS_DIR="$MODELS_DIR" \
  IDLE_TIMEOUT_S="300" \
  $PYTHON gpu_worker.py >> "$LOG" 2>&1

echo "=== Worker terminou em $(date -u +%Y-%m-%dT%H:%M:%SZ) ==="
