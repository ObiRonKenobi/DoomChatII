#!/usr/bin/env bash
# Run on a fresh Ubuntu 22.04 / Oracle Linux VM (Always Free tier).
# Usage: curl -fsSL ... | bash   OR   bash deploy/setup-vm.sh
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/ObiRonKenobi/DoomChatII.git}"
INSTALL_DIR="${INSTALL_DIR:-/opt/doomchat-ii}"

echo "==> Installing Docker..."
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
  sudo usermod -aG docker "$USER" || true
fi

echo "==> Installing git..."
if command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update -qq
  sudo apt-get install -y git curl
elif command -v dnf >/dev/null 2>&1; then
  sudo dnf install -y git curl
fi

echo "==> Cloning DoomChat II to ${INSTALL_DIR}..."
sudo mkdir -p "$(dirname "$INSTALL_DIR")"
if [[ ! -d "$INSTALL_DIR/.git" ]]; then
  sudo git clone "$REPO_URL" "$INSTALL_DIR"
else
  sudo git -C "$INSTALL_DIR" pull --ff-only
fi
sudo chown -R "$USER:$USER" "$INSTALL_DIR"
cd "$INSTALL_DIR"

echo "==> Starting DoomChat II (Docker Compose)..."
docker compose build
docker compose up -d

echo ""
echo "DoomChat II is running on port 8080"
echo "Health (on VM): curl -s http://127.0.0.1:8080/health"
echo ""
echo "Public access: open TCP 8080 in your OCI security list, then:"
echo "  echo 'BASE_URL=http://YOUR_PUBLIC_IP:8080' > .env"
echo "  docker compose up -d"
echo "  open http://YOUR_PUBLIC_IP:8080"
echo ""
echo "Optional later: Cloudflare named tunnel for HTTPS — see README"
