#!/usr/bin/env bash
# Runs on the Ubuntu server (192.168.2.28) with sudo.
# Sets up /var/www/tatendanyemudzo.com, updates Caddyfile, reloads Caddy, and validates the deployment.
set -euo pipefail

TARBALL="${1:-/tmp/tatendanyemudzo-dist.tar.gz}"
REVISION="${2:-}"
SOURCE_ARCHIVE="${3:-}"
WRITER_INSTALL="${4:-}"
SCRIPT_DIR=$(cd -- "$(dirname -- "$0")" && pwd)
WEB_ROOT="/var/www/tatendanyemudzo.com"
CADDYFILE="/etc/caddy/Caddyfile"

if [[ ! -r /etc/os-release ]]; then
  echo "Error: Cannot identify OS release. Aborting." >&2
  exit 1
fi
. /etc/os-release
if [[ "$ID" != ubuntu ]]; then
  echo "Error: Expected Ubuntu; found $ID. Aborting." >&2
  exit 1
fi

if [[ -f /etc/tatenda-writer/enabled ]]; then
  [[ "$REVISION" =~ ^[a-f0-9]{40}$ && -f "$SOURCE_ARCHIVE" && -f "$WRITER_INSTALL" ]] || { echo 'Writer deployments require the committed source archive. The public site was not changed.' >&2; exit 1; }
  exec bash "$WRITER_INSTALL" update "$REVISION" "$SOURCE_ARCHIVE"
fi
if [[ -f /etc/tatenda-writer/config.json ]]; then
  echo 'Writer setup is incomplete or disabled. Finish setup or use the documented rollback before a static deployment.' >&2
  exit 1
fi
if [[ -d "$WEB_ROOT/current" ]]; then WEB_ROOT="$WEB_ROOT/current"; fi

if [[ ! -f "$TARBALL" ]]; then
  echo "Error: Tarball $TARBALL not found." >&2
  exit 1
fi

echo "Deploying static site to $WEB_ROOT..."
mkdir -p "$WEB_ROOT"

# Extract archive
tar -xzf "$TARBALL" -C "$WEB_ROOT"
if [[ ! -f "$WEB_ROOT/index.html" ]]; then
  echo "Error: index.html not found in $WEB_ROOT after extraction." >&2
  exit 1
fi

# Set permissions so Caddy can read all files
if id -u caddy >/dev/null 2>&1; then
  chown -R caddy:caddy "$WEB_ROOT" 2>/dev/null || true
elif id -u www-data >/dev/null 2>&1; then
  chown -R www-data:www-data "$WEB_ROOT" 2>/dev/null || true
fi
chmod -R u=rwX,go=rX "$WEB_ROOT"

# Configure Caddy
echo "Updating Caddyfile at $CADDYFILE..."
mkdir -p /etc/caddy
if [[ -f "$CADDYFILE" ]]; then
  cp "$CADDYFILE" "${CADDYFILE}.bak.$(date +%Y%m%d%H%M%S)"
else
  touch "$CADDYFILE"
fi

echo "Validating Caddy configuration..."
candidate=$(mktemp /etc/caddy/tatenda-candidate.XXXXXX)
trap 'rm -f -- "$candidate"' EXIT
cp "$CADDYFILE" "$candidate"
python3 "$SCRIPT_DIR/update-caddy.py" --config "$candidate" --root "$WEB_ROOT"
caddy validate --config "$candidate" --adapter caddyfile
cp "$candidate" "$CADDYFILE"

echo "Applying configuration to Caddy..."
if ! systemctl reload caddy 2>/dev/null; then
  echo "Reload via admin API unavailable; restarting Caddy service..."
  if ! systemctl restart caddy; then
    echo "Error: Caddy restart failed. Showing service status and recent journal:" >&2
    systemctl status caddy --no-pager >&2 || true
    journalctl -u caddy -n 30 --no-pager >&2 || true
    exit 1
  fi
fi
systemctl is-active --quiet caddy && echo "Caddy service is active."

# Verify local response
echo "Verifying local HTTP response..."
STATUS_CODE=$(curl -s -o /dev/null -w "%{http_code}" -H "Host: tatendanyemudzo.com" http://127.0.0.1/ || true)

if [[ "$STATUS_CODE" == "200" ]]; then
  echo "Local HTTP check passed: HTTP 200 received."
else
  echo "Warning: Local HTTP check returned status $STATUS_CODE. Please verify Caddy logs." >&2
fi

# Clean up tarball
rm -f "$TARBALL"

# Check cloudflared
echo "Checking Cloudflare Tunnel connector (cloudflared)..."
if command -v cloudflared >/dev/null 2>&1; then
  echo "cloudflared is installed: $(cloudflared --version)"
  if systemctl is-active --quiet cloudflared; then
    echo "cloudflared systemd service is active."
  else
    echo "cloudflared is installed but service is not active."
  fi
else
  echo "cloudflared is not installed yet."
  echo "Installing official cloudflared package..."
  ARCH=$(dpkg --print-architecture 2>/dev/null || echo "amd64")
  TMP_DEB="/tmp/cloudflared-${ARCH}.deb"
  if curl -fsSL -o "$TMP_DEB" "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${ARCH}.deb"; then
    dpkg -i "$TMP_DEB" || apt-get install -f -y
    rm -f "$TMP_DEB"
    echo "cloudflared installed successfully: $(cloudflared --version)"
  else
    echo "Note: Could not download cloudflared deb automatically. You can install it following Cloudflare dashboard instructions."
  fi
fi

echo "Deployment completed successfully."
