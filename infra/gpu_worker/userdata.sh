#!/bin/bash
# EC2 userdata: bootstrap rallyvision GPU worker
# Runs as root on first boot of the Deep Learning AMI (Amazon Linux 2023 + PyTorch)
set -euo pipefail

LOG=/var/log/rallyvision-worker.log
exec > >(tee -a "$LOG") 2>&1

echo "=== $(date -u +%Y-%m-%dT%H:%M:%SZ) Rallyvision GPU Worker Bootstrap ==="

BUCKET="rallyvision-videos"
REGION="eu-west-1"
SQS_URL="https://sqs.eu-west-1.amazonaws.com/124839183927/rallyvision-jobs"
MODELS_DIR="/opt/models"
WORKER_DIR="/opt/worker"

mkdir -p "$MODELS_DIR" "$WORKER_DIR"

# Deep Learning AMI (AL2023) uses conda — activate pytorch env
export PATH="/opt/conda/bin:$PATH"
source /opt/conda/etc/profile.d/conda.sh
conda activate pytorch
echo "Python: $(which python) — $(python --version)"
echo "CUDA available: $(python -c 'import torch; print(torch.cuda.is_available())')"

# Install extra deps into the activated env
echo "Installing Python deps..."
pip install -q --upgrade ultralytics opencv-python-headless httpx requests boto3

# Download worker code and pipeline
echo "Downloading worker scripts from S3..."
aws s3 cp "s3://${BUCKET}/worker/gpu_worker.py" "${WORKER_DIR}/gpu_worker.py" --region "$REGION"
aws s3 cp "s3://${BUCKET}/worker/pipeline.py"   "${WORKER_DIR}/pipeline.py"   --region "$REGION"

# Download ML weights
echo "Downloading model weights from S3..."
aws s3 cp "s3://${BUCKET}/models/ball_yolo.pt" "${MODELS_DIR}/ball_yolo.pt" --region "$REGION"
aws s3 cp "s3://${BUCKET}/models/yolov8s.pt"  "${MODELS_DIR}/yolov8s.pt"  --region "$REGION"

echo "All assets downloaded. Starting GPU worker..."

cd "$WORKER_DIR"
SQS_URL="$SQS_URL" \
  AWS_REGION="$REGION" \
  MODELS_DIR="$MODELS_DIR" \
  IDLE_TIMEOUT_S="300" \
  python gpu_worker.py >> "$LOG" 2>&1

echo "=== Worker exited ==="
