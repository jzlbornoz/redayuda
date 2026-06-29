#!/usr/bin/env bash
# Auto-deploy robusto para el homelab (no depende del runner de Forgejo Actions).
# Cada ejecucion: si origin/main avanzo, reconstruye y levanta el contenedor.
# Instalar en cron, p.ej. cada minuto:
#   * * * * * /home/eriktaveras/selfhosted/apigeneral/deploy.sh >> /tmp/apigeneral-deploy.log 2>&1
set -euo pipefail

APP_DIR="/home/eriktaveras/selfhosted/apigeneral"
cd "$APP_DIR"

git fetch -q origin main

LOCAL="$(git rev-parse HEAD)"
REMOTE="$(git rev-parse origin/main)"
if [ "$LOCAL" = "$REMOTE" ]; then
  exit 0  # nada nuevo
fi

echo "[$(date -Is)] Desplegando $LOCAL -> $REMOTE"
git reset --hard -q origin/main

docker compose up -d --build
docker image prune -f >/dev/null 2>&1 || true

# Health check (no aborta si tarda en levantar)
sleep 4
code="$(curl -fsS -o /dev/null -w '%{http_code}' http://127.0.0.1:8088/health || echo 000)"
echo "[$(date -Is)] Deploy OK ($REMOTE) — health $code"
