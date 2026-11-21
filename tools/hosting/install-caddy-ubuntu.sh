#!/usr/bin/env bash
# Run on the confirmed Ubuntu server, through the visible Mac Terminal launcher.
# Official source: https://caddyserver.com/docs/install#debian-ubuntu-raspbian
set -euo pipefail

if [[ ! -r /etc/os-release ]]; then
  echo 'Cannot identify this server. Installation stopped.' >&2
  exit 1
fi
. /etc/os-release
if [[ "$ID" != ubuntu ]]; then
  echo "Expected Ubuntu; found $ID. Installation stopped." >&2
  exit 1
fi
printf 'Server OS: %s\n' "$PRETTY_NAME"

if command -v caddy >/dev/null 2>&1; then
  echo 'Caddy is already installed; its package and configuration were preserved.'
  caddy version
  if systemctl is-active --quiet caddy; then
    echo 'Caddy verification: already installed and active.'
    exit 0
  fi
  echo 'Caddy is installed, but its existing service is inactive. Its configuration was preserved.' >&2
  exit 3
fi

if ! command -v ss >/dev/null 2>&1; then
  echo 'Cannot check existing web services because ss is unavailable. Installation stopped.' >&2
  exit 1
fi
if [[ -n "$(ss -H -ltn '( sport = :80 or sport = :443 )')" ]]; then
  echo 'A service already listens on port 80 or 443. Installation stopped to preserve it.' >&2
  ss -ltn '( sport = :80 or sport = :443 )'
  exit 2
fi

if [[ "$EUID" -eq 0 ]]; then
  admin=()
else
  admin=(sudo)
  sudo -v
fi

install_tmp=$(mktemp -d)
trap 'rm -rf -- "$install_tmp"' EXIT

"${admin[@]}" apt-get update
"${admin[@]}" apt-get install --yes debian-keyring debian-archive-keyring apt-transport-https ca-certificates curl gnupg

# Download signing/repository data, not an executable remote installer.
curl --fail --show-error --silent --location --proto '=https' --tlsv1.2 \
  'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' --output "$install_tmp/key.asc"
curl --fail --show-error --silent --location --proto '=https' --tlsv1.2 \
  'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' --output "$install_tmp/caddy-stable.list"
grep -q 'dl.cloudsmith.io/public/caddy/stable' "$install_tmp/caddy-stable.list"
grep -q 'signed-by=/usr/share/keyrings/caddy-stable-archive-keyring.gpg' "$install_tmp/caddy-stable.list"
gpg --batch --yes --dearmor --output "$install_tmp/key.gpg" "$install_tmp/key.asc"
"${admin[@]}" install -m 0644 "$install_tmp/key.gpg" /usr/share/keyrings/caddy-stable-archive-keyring.gpg
"${admin[@]}" install -m 0644 "$install_tmp/caddy-stable.list" /etc/apt/sources.list.d/caddy-stable.list
"${admin[@]}" apt-get update
"${admin[@]}" apt-get install --yes caddy

caddy version
"${admin[@]}" caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
"${admin[@]}" systemctl enable --now caddy
systemctl is-active --quiet caddy
curl --fail --silent --show-error --connect-timeout 5 --output /dev/null http://127.0.0.1/
echo 'Caddy installation verified: configuration valid, systemd active, local HTTP responding.'
