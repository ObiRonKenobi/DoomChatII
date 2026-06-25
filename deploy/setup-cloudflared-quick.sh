#!/usr/bin/env bash
# Cloudflare Quick Tunnel — no domain, no Cloudflare credit card.
# Gives a random https://xxxx.trycloudflare.com URL (changes when tunnel restarts).
set -euo pipefail

echo "==> Installing cloudflared..."
if ! command -v cloudflared >/dev/null 2>&1; then
  ARCH=$(uname -m)
  case "$ARCH" in
    x86_64) CF_ARCH=amd64 ;;
    aarch64|arm64) CF_ARCH=arm64 ;;
    *) echo "Unsupported arch: $ARCH"; exit 1 ;;
  esac
  CF_VERSION=2024.12.2
  curl -fsSL "https://github.com/cloudflare/cloudflared/releases/download/${CF_VERSION}/cloudflared-linux-${CF_ARCH}" \
    -o /tmp/cloudflared
  sudo install -m 755 /tmp/cloudflared /usr/local/bin/cloudflared
fi

echo "==> Creating systemd service for quick tunnel..."
sudo tee /etc/systemd/system/cloudflared-doomchat.service >/dev/null <<'UNIT'
[Unit]
Description=Cloudflare Quick Tunnel for DoomChat II
After=network-online.target docker.service
Wants=network-online.target

[Service]
Type=simple
ExecStart=/usr/local/bin/cloudflared tunnel --url http://127.0.0.1:8080
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
UNIT

sudo systemctl daemon-reload
sudo systemctl enable --now cloudflared-doomchat.service

echo ""
echo "Waiting for tunnel URL (up to 30s)..."
sleep 5
URL=$(sudo journalctl -u cloudflared-doomchat.service -n 50 --no-pager 2>/dev/null \
  | grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' | tail -1 || true)

echo ""
if [[ -n "$URL" ]]; then
  echo "Your public URL: $URL"
  echo ""
  echo "Update BASE_URL in docker-compose / .env and restart doomchat:"
  echo "  cd /opt/doomchat-ii"
  echo "  echo 'BASE_URL=$URL' > .env"
  echo "  docker compose up -d"
else
  echo "Tunnel started. Find your URL with:"
  echo "  sudo journalctl -u cloudflared-doomchat.service -f"
  echo "  (look for a https://....trycloudflare.com line)"
fi
echo ""
echo "Note: Quick tunnel URLs change when the tunnel restarts."
