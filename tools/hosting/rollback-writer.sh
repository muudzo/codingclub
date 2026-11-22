#!/usr/bin/env bash
# Disable the editor while keeping the latest public build and all source/state.
set -Eeuo pipefail
[[ "$EUID" -eq 0 ]] || { echo 'Run with sudo.' >&2; exit 1; }
node=/opt/tatenda-writer/runtime/bin/node
app=/opt/tatenda-writer/current
config=/etc/tatenda-writer
web=/var/www/tatendanyemudzo.com
if [[ "${1:-}" != locked ]]; then
  systemctl stop tatenda-writer
  exec "$node" "$app/tools/writer/lock.mjs" /var/lib/tatenda-writer/state/publish.lock -- bash "$0" locked
fi
backup=$(mktemp -d /var/backups/tatenda-writer-rollback.XXXXXX)
chmod 700 "$backup"
cp /etc/caddy/Caddyfile "$backup/Caddyfile"
cp /etc/caddy/Caddyfile "$backup/candidate"
"$node" --input-type=module - "$web/current" <<'JS'
import { recoverPublicOutput } from '/opt/tatenda-writer/current/tools/writer/git-publish.mjs';
await recoverPublicOutput(process.argv[2]);
JS
python3 "$app/tools/hosting/update-caddy.py" --config "$backup/candidate" --root "$web/current"
caddy validate --config "$backup/candidate" --adapter caddyfile
cp "$backup/candidate" /etc/caddy/Caddyfile
if ! systemctl reload caddy 2>/dev/null && ! systemctl restart caddy; then
  cp "$backup/Caddyfile" /etc/caddy/Caddyfile
  systemctl restart caddy
  echo 'Could not apply the static configuration; previous configuration restored.' >&2
  exit 1
fi
systemctl disable tatenda-writer
rm -f "$config/enabled"
if [[ -f "$config/config.json" ]]; then mv "$config/config.json" "$config/config.disabled.json"; fi
echo 'Private editor disabled. The latest public website, GitHub posts, photos, credentials and state are preserved.'
