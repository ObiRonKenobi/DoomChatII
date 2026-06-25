#!/usr/bin/env bash
# Cloudflare Named Tunnel — stable https://chat.yourdomain.com
# Requires: free Cloudflare account + a domain added to Cloudflare (no CF credit card).
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 chat.yourdomain.com"
  echo ""
  echo "Before running:"
  echo "  1. Add your domain to Cloudflare (free plan)"
  echo "  2. On your laptop, run: cloudflared tunnel login"
  echo "  3. Copy ~/.cloudflared/cert.pem to this VM: ~/.cloudflared/cert.pem"
  echo "  4. Run this script with the hostname you want (must be under that domain)"
  exit 1
fi

HOSTNAME="$1"
TUNNEL_NAME="${TUNNEL_NAME:-doomchat-ii}"
CONFIG_DIR="$HOME/.cloudflared"
INSTALL_DIR="${INSTALL_DIR:-/opt/doomchat-ii}"

if [[ ! -f "$CONFIG_DIR/cert.pem" ]]; then
  echo "Missing $CONFIG_DIR/cert.pem — run 'cloudflared tunnel login' on a machine with a browser,"
  echo "then copy cert.pem to this VM at $CONFIG_DIR/cert.pem"
  exit 1
fi

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

mkdir -p "$CONFIG_DIR"

if [[ ! -f "$CONFIG_DIR/${TUNNEL_ID}.json" ]] && ! cloudflared tunnel list 2>/dev/null | grep -q "$TUNNEL_NAME"; then
  echo "==> Creating tunnel '$TUNNEL_NAME'..."
  cloudflared tunnel create "$TUNNEL_NAME"
fi

TUNNEL_ID=$(cloudflared tunnel list | awk -v n="$TUNNEL_NAME" '$0 ~ n {print $1; exit}')
if [[ -z "$TUNNEL_ID" ]]; then
  echo "Could not find tunnel ID for $TUNNEL_NAME"
  exit 1
fi

echo "==> Routing DNS: $HOSTNAME -> tunnel $TUNNEL_ID"
cloudflared tunnel route dns "$TUNNEL_NAME" "$HOSTNAME"

echo "==> Writing config..."
cat > "$CONFIG_DIR/config.yml" <<EOF
tunnel: ${TUNNEL_ID}
credentials-file: ${CONFIG_DIR}/${TUNNEL_ID}.json

ingress:
  - hostname: ${HOSTNAME}
    service: http://127.0.0.1:8080
  - service: http_status:404
EOF

echo "==> Creating systemd service..."
sudo tee /etc/systemd/system/cloudflared-doomchat.service >/dev/null <<UNIT
[Unit]
Description=Cloudflare Named Tunnel for DoomChat II
After=network-online.target docker.service
Wants=network-online.target

[Service]
Type=simple
User=${USER}
ExecStart=/usr/local/bin/cloudflared tunnel --config ${CONFIG_DIR}/config.yml run
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
UNIT

sudo systemctl daemon-reload
sudo systemctl enable --now cloudflared-doomchat.service

PUBLIC_URL="https://${HOSTNAME}"
if [[ -d "$INSTALL_DIR" ]]; then
  echo "BASE_URL=${PUBLIC_URL}" > "$INSTALL_DIR/.env"
  cd "$INSTALL_DIR" && docker compose up -d
fi

echo ""
echo "Done! Stable URL: ${PUBLIC_URL}"
echo "WebSocket: wss://${HOSTNAME}/ws"
echo "Health: curl -s ${PUBLIC_URL}/health"
