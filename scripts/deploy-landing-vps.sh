#!/usr/bin/env bash
# Deploy static landing to a VPS over SSH.
# Prerequisites: SSH access as root (or set REMOTE_USER), DNS A record for hostname -> server IP.
#
# Usage:
#   VPS=root@187.124.144.206 bash scripts/deploy-landing-vps.sh
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VPS="${VPS:?Set VPS=user@host}"
REMOTE_DIR="${REMOTE_DIR:-/var/www/persoxxl}"

echo "==> Sync landing + ai-input -> ${VPS}:${REMOTE_DIR}"
rsync -avz --delete \
  --exclude '.DS_Store' \
  "${ROOT}/landing/" "${VPS}:${REMOTE_DIR}/landing/"
rsync -avz --delete \
  --exclude '.DS_Store' \
  "${ROOT}/ai-input/" "${VPS}:${REMOTE_DIR}/ai-input/"

echo "==> Ensure config/env.js (OpenRouter demo optional)"
ssh "${VPS}" bash -s <<REMOTE
set -euo pipefail
mkdir -p "${REMOTE_DIR}/landing/config"
ENV_TARGET="${REMOTE_DIR}/landing/config/env.js"
ENV_EXAMPLE="${REMOTE_DIR}/landing/config/env.example.js"
if [[ ! -f "\${ENV_TARGET}" ]] && [[ -f "\${ENV_EXAMPLE}" ]]; then
  cp "\${ENV_EXAMPLE}" "\${ENV_TARGET}"
  echo "Created env.js from env.example.js (empty API key — OK for browse-only)."
fi
REMOTE

echo "==> Done. From this repo on your machine (with SSH working), finish TLS:"
echo "    scp nginx/persoxxl.calgarypermit.ca.conf ${VPS}:/etc/nginx/sites-available/"
echo "    ssh ${VPS} 'ln -sf /etc/nginx/sites-available/persoxxl.calgarypermit.ca.conf /etc/nginx/sites-enabled/ && nginx -t && systemctl reload nginx'"
echo "    ssh ${VPS} 'certbot --nginx -d persoxxl.calgarypermit.ca'"
