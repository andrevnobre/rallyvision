#!/bin/bash
# Upload worker scripts and ML weights to S3 for EC2 instances to download on boot.
# Run from repo root: bash infra/gpu_worker/deploy_worker.sh
set -euo pipefail

BUCKET="rallyvision-videos"
REGION="eu-west-1"

echo "Uploading worker scripts..."
aws s3 cp infra/gpu_worker/gpu_worker.py "s3://${BUCKET}/worker/gpu_worker.py" --region "$REGION"
aws s3 cp backend/app/worker/pipeline.py  "s3://${BUCKET}/worker/pipeline.py"  --region "$REGION"

echo "Uploading ML weights..."
aws s3 cp ml/spike/ball_yolo.pt "s3://${BUCKET}/models/ball_yolo.pt" --region "$REGION"
aws s3 cp ml/spike/yolov8s.pt   "s3://${BUCKET}/models/yolov8s.pt"   --region "$REGION"

echo "Done. Files in S3:"
aws s3 ls "s3://${BUCKET}/worker/" --region "$REGION"
aws s3 ls "s3://${BUCKET}/models/" --region "$REGION"
