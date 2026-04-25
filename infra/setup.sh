#!/usr/bin/env bash
# BT Vision — Setup de produção no AWS Lightsail (Ubuntu 24.04)
# Corre este script como root ou com sudo na instância Lightsail.
# Uso: bash setup.sh

set -euo pipefail

REPO_URL="https://github.com/andrevnobre/rallyvision.git"
APP_DIR="/opt/rallyvision"
NGINX_SITE="/etc/nginx/sites-available/bt-vision"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()  { echo -e "${GREEN}▶ $*${NC}"; }
warn() { echo -e "${YELLOW}⚠ $*${NC}"; }

# ── 1. Sistema ─────────────────────────────────────────────────────────────────
log "A actualizar pacotes do sistema…"
apt-get update -qq && apt-get upgrade -y -qq

# ── 2. Docker ──────────────────────────────────────────────────────────────────
if ! command -v docker &>/dev/null; then
    log "A instalar Docker…"
    curl -fsSL https://get.docker.com | sh
    systemctl enable --now docker
else
    log "Docker já instalado."
fi

# ── 3. Nginx + Certbot ─────────────────────────────────────────────────────────
log "A instalar Nginx e Certbot…"
apt-get install -y -qq nginx certbot python3-certbot-nginx

# ── 4. Repositório ─────────────────────────────────────────────────────────────
log "A clonar repositório em ${APP_DIR}…"
if [ -d "$APP_DIR/.git" ]; then
    warn "Repositório já existe — a fazer pull…"
    git -C "$APP_DIR" pull --ff-only
else
    git clone "$REPO_URL" "$APP_DIR"
fi

cd "$APP_DIR/infra"

# ── 5. Ficheiro de ambiente ────────────────────────────────────────────────────
if [ ! -f .env.prod ]; then
    log "A criar .env.prod a partir do template…"
    cp .env.prod.example .env.prod

    DB_PASS=$(python3 -c "import secrets; print(secrets.token_urlsafe(24))")
    SECRET=$(python3 -c "import secrets; print(secrets.token_hex(32))")

    sed -i "s/TROCA_DB_PASSWORD/${DB_PASS}/g" .env.prod
    sed -i "s/TROCA_POR_VALOR_ALEATORIO_LONGO/${SECRET}/" .env.prod

    warn "Ficheiro .env.prod criado com segredos gerados automaticamente."
    warn "Para adicionar credenciais AWS/S3, edita: ${APP_DIR}/infra/.env.prod"
else
    warn ".env.prod já existe — a manter valores actuais."
fi

# Exportar POSTGRES_PASSWORD para o compose ler do .env.prod
export $(grep -E '^POSTGRES_' .env.prod | xargs)

# ── 6. Build e arranque dos containers ────────────────────────────────────────
log "A fazer build e a arrancar os containers (pode demorar alguns minutos)…"
docker compose -f docker-compose.prod.yml pull --ignore-buildable
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml up -d

# ── 7. Nginx ───────────────────────────────────────────────────────────────────
log "A configurar Nginx…"
cp "$APP_DIR/infra/nginx.conf" "$NGINX_SITE"

# Ativar site e desativar default
ln -sf "$NGINX_SITE" /etc/nginx/sites-enabled/bt-vision
rm -f /etc/nginx/sites-enabled/default

nginx -t
systemctl reload nginx

# ── 8. SSL com Let's Encrypt ───────────────────────────────────────────────────
log "A obter certificados SSL…"
warn "Confirma que os registos DNS já apontam para este IP antes de continuar."
warn "  bt-vision.com     → $(curl -s ifconfig.me)"
warn "  www.bt-vision.com → $(curl -s ifconfig.me)"
warn "  api.bt-vision.com → $(curl -s ifconfig.me)"
echo ""
read -rp "Os registos DNS estão configurados? (s/N): " dns_ok
if [[ "${dns_ok,,}" == "s" ]]; then
    read -rp "Email para o Let's Encrypt (notificações de renovação): " LE_EMAIL
    certbot --nginx \
        -d bt-vision.com \
        -d www.bt-vision.com \
        -d api.bt-vision.com \
        --non-interactive \
        --agree-tos \
        --email "$LE_EMAIL" \
        --redirect
    log "SSL configurado! Renovação automática activa."
else
    warn "SSL ignorado. Corre manualmente quando o DNS estiver propagado:"
    warn "  certbot --nginx -d bt-vision.com -d www.bt-vision.com -d api.bt-vision.com"
fi

# ── 9. Auto-start dos containers no boot ──────────────────────────────────────
log "A configurar auto-start via systemd…"
cat > /etc/systemd/system/bt-vision.service << EOF
[Unit]
Description=BT Vision Docker Compose
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=${APP_DIR}/infra
ExecStart=docker compose -f docker-compose.prod.yml up -d
ExecStop=docker compose -f docker-compose.prod.yml down
TimeoutStartSec=300

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable bt-vision.service

# ── 10. Resumo ─────────────────────────────────────────────────────────────────
log "Setup concluído!"
echo ""
echo "  Frontend : https://bt-vision.com"
echo "  API      : https://api.bt-vision.com/docs"
echo "  Logs     : docker compose -f ${APP_DIR}/infra/docker-compose.prod.yml logs -f"
echo "  Update   : cd ${APP_DIR} && git pull && cd infra && docker compose -f docker-compose.prod.yml up -d --build"
echo ""
