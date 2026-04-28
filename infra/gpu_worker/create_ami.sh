#!/bin/bash
# Cria AMI personalizada com deps pré-instaladas para o GPU worker rallyvision.
# Após criar a AMI, os arranques passam de ~3-4 min para ~60-90s.
#
# Uso:
#   LAUNCH_TEMPLATE_ID=lt-XXXXXXXXXXXXXXXXX bash create_ami.sh
#
# Pré-requisitos:
#   - AWS CLI configurado com permissões EC2 + S3
#   - Launch template com o AMI Deep Learning (AL2023) base

set -euo pipefail

REGION="eu-west-1"
BUCKET="rallyvision-videos"
AMI_NAME="rallyvision-gpu-worker-$(date +%Y%m%d-%H%M)"

LAUNCH_TEMPLATE_ID="${LAUNCH_TEMPLATE_ID:-}"
if [ -z "$LAUNCH_TEMPLATE_ID" ]; then
    echo "Erro: define LAUNCH_TEMPLATE_ID"
    echo "Uso: LAUNCH_TEMPLATE_ID=lt-XXXX bash create_ami.sh"
    exit 1
fi

echo "================================================"
echo " Criar AMI rallyvision GPU worker"
echo " Launch Template : $LAUNCH_TEMPLATE_ID"
echo " AMI Name        : $AMI_NAME"
echo " Regiao          : $REGION"
echo "================================================"
echo ""

# ── 1. Lançar instância temporária on-demand ──────────────────────────────────
echo "[1/6] A lançar instância temporária on-demand..."
INSTANCE_ID=$(aws ec2 run-instances \
    --region "$REGION" \
    --launch-template "LaunchTemplateId=${LAUNCH_TEMPLATE_ID},Version=\$Default" \
    --min-count 1 --max-count 1 \
    --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=rallyvision-ami-builder},{Key=Purpose,Value=rallyvision-ami-builder}]" \
    --query "Instances[0].InstanceId" --output text)

echo "  Instance ID: $INSTANCE_ID"

# ── 2. Aguardar running ───────────────────────────────────────────────────────
echo "[2/6] A aguardar estado running..."
aws ec2 wait instance-running --instance-ids "$INSTANCE_ID" --region "$REGION"
echo "  Instância running."

# ── 3. Aguardar que o userdata complete ───────────────────────────────────────
# O userdata faz: pip install (~90s) + download de 2 modelos (~60s) + warmup YOLO (~30s)
# Aguardamos 7 min para ter margem confortável.
WAIT_SECS=420
echo "[3/6] A aguardar setup completo (${WAIT_SECS}s)..."
echo "  (pip install ultralytics/opencv + download modelos S3 + YOLO warmup)"
for i in $(seq 1 $((WAIT_SECS / 30))); do
    sleep 30
    echo "  ... $((i * 30))s / ${WAIT_SECS}s"
done
echo "  Setup concluido (assumido)."

# ── 4. Criar AMI ──────────────────────────────────────────────────────────────
echo "[4/6] A criar AMI..."
AMI_ID=$(aws ec2 create-image \
    --region "$REGION" \
    --instance-id "$INSTANCE_ID" \
    --name "$AMI_NAME" \
    --description "rallyvision GPU worker — ultralytics, opencv, modelos pre-instalados" \
    --no-reboot \
    --query "ImageId" --output text)

echo "  AMI ID: $AMI_ID"
echo "  A aguardar AMI disponivel (pode demorar 3-5 min)..."
aws ec2 wait image-available --image-ids "$AMI_ID" --region "$REGION"
echo "  AMI disponivel."

# ── 5. Terminar instância temporária ──────────────────────────────────────────
echo "[5/6] A terminar instância temporária..."
aws ec2 terminate-instances --instance-ids "$INSTANCE_ID" --region "$REGION" > /dev/null
echo "  Terminada."

# ── 6. Instruções para atualizar o launch template ───────────────────────────
echo ""
echo "[6/6] A actualizar launch template para usar nova AMI..."
NEW_VERSION=$(aws ec2 create-launch-template-version \
    --region "$REGION" \
    --launch-template-id "$LAUNCH_TEMPLATE_ID" \
    --source-version 1 \
    --launch-template-data "{\"ImageId\":\"${AMI_ID}\"}" \
    --query "LaunchTemplateVersion.VersionNumber" --output text)

aws ec2 modify-launch-template \
    --region "$REGION" \
    --launch-template-id "$LAUNCH_TEMPLATE_ID" \
    --default-version "$NEW_VERSION" > /dev/null

echo "  Launch template atualizado para versao $NEW_VERSION (AMI $AMI_ID)"

echo ""
echo "================================================"
echo " AMI criada e launch template atualizado!"
echo " AMI ID  : $AMI_ID"
echo " AMI Name: $AMI_NAME"
echo ""
echo " Proximos arranques: ~60-90s (em vez de 3-4 min)"
echo "================================================"
