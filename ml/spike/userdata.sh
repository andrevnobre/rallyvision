#!/bin/bash
set -e
BUCKET="rallyvision-spike-124839183927"
WORKDIR="/home/ubuntu/spike"
mkdir -p $WORKDIR
cd $WORKDIR

# Dependências (PyTorch já vem na AMI, só pip extras)
pip install -q opencv-python-headless supervision ultralytics 2>&1 | tail -5

# Download dos arquivos do S3
aws s3 cp s3://$BUCKET/input/video.mp4 video.mp4
aws s3 cp s3://$BUCKET/input/tracknet_weights.pt tracknet_weights.pt

# Download dos scripts do GitHub
pip install -q requests
python3 -c "
import urllib.request
base = 'https://raw.githubusercontent.com/andrevnobre/rallyvision/main/ml/spike'
for f in ['tracknet_model.py', 'tracknet_spike.py']:
    urllib.request.urlretrieve(f'{base}/{f}', f)
    print(f'Downloaded {f}')
"

# Rodar spike (sem gerar vídeo anotado para ser mais rápido)
python3 tracknet_spike.py \
  --video video.mp4 \
  --weights tracknet_weights.pt \
  --no-output \
  2>&1 | tee spike_output.log

# Upload dos resultados
aws s3 cp spike_output.log s3://$BUCKET/output/spike_output.log
aws s3 cp video_tracknet_report.json s3://$BUCKET/output/video_tracknet_report.json 2>/dev/null || true

echo "DONE" | aws s3 cp - s3://$BUCKET/output/DONE

# Terminar instância automaticamente
INSTANCE_ID=$(curl -s http://169.254.169.254/latest/meta-data/instance-id)
aws ec2 terminate-instances --instance-ids $INSTANCE_ID --region us-east-1
