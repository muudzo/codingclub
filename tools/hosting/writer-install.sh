#!/usr/bin/env bash
# Dedicated, single-site phone publisher. Run through the native Terminal launcher.
set -Eeuo pipefail
WRITER_USER=tatenda-writer
DATA=/var/lib/tatenda-writer
BASE=/opt/tatenda-writer
CONFIG=/etc/tatenda-writer
WEB=/var/www/tatendanyemudzo.com
CADDY=/etc/caddy/Caddyfile
MODE="${1:-}"
REVISION="${2:-}"
BUNDLE="${3:-}"

[[ "$EUID" -eq 0 ]] || { echo 'Run this installer with sudo.' >&2; exit 1; }
. /etc/os-release
[[ "$ID" == ubuntu ]] || { echo 'Expected Ubuntu; no changes made.' >&2; exit 1; }

prepare() {
  for command in git curl xz ssh-keygen python3; do
    if ! command -v "$command" >/dev/null; then
      apt-get update -qq
      apt-get install -y git curl xz-utils openssh-client python3
      break
    fi
  done
  if ! id "$WRITER_USER" >/dev/null 2>&1; then
    useradd --system --user-group --home-dir "$DATA" --create-home --shell /usr/sbin/nologin "$WRITER_USER"
  fi
  [[ "$(getent passwd "$WRITER_USER" | cut -d: -f6)" == "$DATA" ]] || { echo 'Unexpected existing writer account; inspect it before continuing.' >&2; exit 1; }
  install -d -m 700 -o "$WRITER_USER" -g "$WRITER_USER" "$DATA" "$DATA/state" "$DATA/.ssh" "$DATA/app-releases"
  if [[ ! -e "$DATA/state/publish.lock" ]]; then install -m 600 -o "$WRITER_USER" -g "$WRITER_USER" /dev/null "$DATA/state/publish.lock"; fi
  chown "$WRITER_USER:$WRITER_USER" "$DATA/state/publish.lock"
  install -d -m 755 "$BASE"
  install -d -m 750 -o root -g "$WRITER_USER" "$CONFIG"
  local node_version=22.23.4 architecture node_archive temporary expected actual
  case "$(uname -m)" in x86_64) architecture=x64;; aarch64|arm64) architecture=arm64;; *) echo 'Unsupported server architecture.' >&2; exit 1;; esac
  if [[ ! -x "$BASE/node-v${node_version}/bin/node" ]]; then
    temporary=$(mktemp -d /tmp/tatenda-node.XXXXXX)
    node_archive="node-v${node_version}-linux-${architecture}.tar.xz"
    curl -fsSL "https://nodejs.org/dist/v${node_version}/SHASUMS256.txt" -o "$temporary/checksums"
    curl -fsSL "https://nodejs.org/dist/v${node_version}/$node_archive" -o "$temporary/$node_archive"
    expected=$(awk -v file="$node_archive" '$2==file {print $1}' "$temporary/checksums")
    actual=$(sha256sum "$temporary/$node_archive" | cut -d' ' -f1)
    [[ -n "$expected" && "$expected" == "$actual" ]] || { echo 'Node checksum verification failed.' >&2; exit 1; }
    rm -rf -- "$BASE/node-v${node_version}"
    mkdir "$BASE/node-v${node_version}"
    tar -xJf "$temporary/$node_archive" --strip-components=1 -C "$BASE/node-v${node_version}"
    rm -rf -- "$temporary"
  fi
  [[ ! -e "$BASE/runtime" || -L "$BASE/runtime" ]] || { echo 'Unexpected runtime directory; stopping.' >&2; exit 1; }
  ln -sfnT "$BASE/node-v${node_version}" "$BASE/runtime"
  if [[ ! -f "$DATA/.ssh/github_ed25519" ]]; then
    runuser -u "$WRITER_USER" -- ssh-keygen -q -t ed25519 -N '' -C tatenda-phone-publishing -f "$DATA/.ssh/github_ed25519"
  fi
  curl -fsSL https://api.github.com/meta | python3 -c 'import json,sys; print("\n".join("github.com " + key for key in json.load(sys.stdin)["ssh_keys"]))' > "$DATA/.ssh/known_hosts"
  chown "$WRITER_USER:$WRITER_USER" "$DATA/.ssh/known_hosts"
  chmod 600 "$DATA/.ssh/known_hosts"
  printf 'WRITER_PUBLIC_KEY='
  cat "$DATA/.ssh/github_ed25519.pub"
  echo 'Server publishing prerequisites prepared.'
}

apply() {
  local revision="$1" source="$2" release="$DATA/app-releases/$1" node="$BASE/runtime/bin/node"
  local backup output_backup old_app='' old_config=0 old_enabled=0 old_unit=0 old_output=0 switched=0 caddy_applied=0
  backup=$(mktemp -d /var/backups/tatenda-writer.XXXXXX)
  chmod 700 "$backup"
  output_backup="$WEB/previous-$("$node" -e 'console.log(require("crypto").randomUUID())')"
  cp "$CADDY" "$backup/Caddyfile"
  [[ ! -L "$BASE/current" ]] || old_app=$(readlink "$BASE/current")
  if [[ -f "$CONFIG/config.json" ]]; then cp "$CONFIG/config.json" "$backup/config.json"; old_config=1; fi
  if [[ -f "$CONFIG/enabled" ]]; then old_enabled=1; fi
  if [[ -f /etc/systemd/system/tatenda-writer.service ]]; then cp /etc/systemd/system/tatenda-writer.service "$backup/service"; old_unit=1; fi

  rollback_error() {
    local status="$1"
    trap - ERR
    set +e
    echo 'Writer setup did not finish; restoring the previous service and public configuration.' >&2
    systemctl stop tatenda-writer 2>/dev/null
    if [[ "$switched" == 1 ]]; then
      rm -rf -- "$WEB/current"
      if [[ "$old_output" == 1 ]]; then mv "$output_backup" "$WEB/current"; fi
    fi
    if [[ -n "$old_app" ]]; then ln -sfnT "$old_app" "$BASE/current"; else rm -f "$BASE/current"; fi
    if [[ "$old_config" == 1 ]]; then cp "$backup/config.json" "$CONFIG/config.json"; else rm -f "$CONFIG/config.json"; fi
    if [[ "$old_enabled" == 1 ]]; then touch "$CONFIG/enabled"; else rm -f "$CONFIG/enabled"; fi
    if [[ "$old_unit" == 1 ]]; then cp "$backup/service" /etc/systemd/system/tatenda-writer.service; else rm -f /etc/systemd/system/tatenda-writer.service; fi
    cp "$backup/Caddyfile" "$CADDY"
    systemctl daemon-reload
    if [[ "$old_enabled" == 1 ]]; then systemctl restart tatenda-writer; else systemctl disable tatenda-writer 2>/dev/null; fi
    if [[ "$caddy_applied" == 1 ]]; then systemctl reload caddy 2>/dev/null || systemctl restart caddy; fi
    echo "Setup backup retained at $backup" >&2
    exit "$status"
  }
  trap 'rollback_error "$?"' ERR

  if [[ ! -d "$DATA/repository/.git" ]]; then
    runuser -u "$WRITER_USER" -- env GIT_SSH_COMMAND="ssh -F /dev/null -i $DATA/.ssh/github_ed25519 -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile=$DATA/.ssh/known_hosts" git clone --branch main git@github.com:muudzo/codingclub.git "$DATA/repository"
  fi
  local origin
  origin=$(runuser -u "$WRITER_USER" -- git -C "$DATA/repository" remote get-url origin)
  [[ "$origin" == git@github.com:muudzo/codingclub.git ]] || { echo 'Unexpected publishing repository.' >&2; false; }
  runuser -u "$WRITER_USER" -- git -C "$DATA/repository" config user.name 'Tatenda Nyemudzo'
  runuser -u "$WRITER_USER" -- git -C "$DATA/repository" config user.email '182634892+muudzo@users.noreply.github.com'
  python3 - "$CONFIG/config.json" <<'PY'
import json,sys
from pathlib import Path
Path(sys.argv[1]).write_text(json.dumps({
  "repository":"/var/lib/tatenda-writer/repository",
  "stateRoot":"/var/lib/tatenda-writer/state",
  "publicRoot":"/var/www/tatendanyemudzo.com/current",
  "passwordFile":"/var/lib/tatenda-writer/owner.json",
  "keyFile":"/var/lib/tatenda-writer/.ssh/github_ed25519",
  "knownHostsFile":"/var/lib/tatenda-writer/.ssh/known_hosts",
  "publicOrigin":"https://tatendanyemudzo.com",
  "port":3210
}))
PY
  chown "root:$WRITER_USER" "$CONFIG/config.json"
  chmod 640 "$CONFIG/config.json"
  runuser -u "$WRITER_USER" -- "$node" "$source/tools/writer/check-revision.mjs" "$revision"
  if [[ ! -d "$release" ]]; then
    mkdir "$release"
    cp -a "$source/." "$release/"
    chown -Rh "$WRITER_USER:$WRITER_USER" "$release"
  fi
  if [[ ! -f "$release/.dependencies-ready" ]]; then
    runuser -u "$WRITER_USER" -- env PATH="$BASE/runtime/bin:/usr/local/bin:/usr/bin:/bin" "$BASE/runtime/bin/npm" ci --no-audit --no-fund --prefix "$release"
    runuser -u "$WRITER_USER" -- touch "$release/.dependencies-ready"
  fi
  install -d -m 755 -o "$WRITER_USER" -g "$WRITER_USER" "$WEB"
  local staging="$WEB/build-deployment-$revision"
  local astro_bin
  astro_bin=$("$node" -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).bin.astro)' "$release/node_modules/astro/package.json")
  rm -rf -- "$staging"
  runuser -u "$WRITER_USER" -- env SITE_URL=https://tatendanyemudzo.com BASE_PATH=/ WRITER_ASTRO_CACHE_DIR="$DATA/state/deployment-cache" "$node" "$release/node_modules/astro/$astro_bin" build --root "$release" --outDir "$staging"
  [[ -f "$staging/index.html" ]] || { echo 'The build did not produce a homepage.' >&2; false; }
  chmod -R u=rwX,go=rX "$staging"
  if [[ ! -f "$DATA/owner.json" ]]; then
    local owner_password owner_confirm
    echo 'Choose a private publishing password (14–256 characters). It is separate from your Ubuntu password.'
    while true; do
      IFS= read -rs -p 'Publishing password: ' owner_password; printf '\n'
      IFS= read -rs -p 'Confirm publishing password: ' owner_confirm; printf '\n'
      if [[ "$owner_password" == "$owner_confirm" && "${#owner_password}" -ge 14 && "${#owner_password}" -le 256 ]]; then break; fi
      echo 'The passwords must match and contain at least 14 characters.'
    done
    printf '%s' "$owner_password" | runuser -u "$WRITER_USER" -- "$node" "$release/tools/writer/auth.mjs" "$DATA/owner.json"
    unset owner_password owner_confirm
  fi
  local candidate="$backup/candidate"
  cp "$CADDY" "$candidate"
  python3 "$release/tools/hosting/update-caddy.py" --config "$candidate" --root "$WEB/current" --writer
  caddy validate --config "$candidate" --adapter caddyfile
  if [[ -d "$WEB/current" ]]; then mv "$WEB/current" "$output_backup"; old_output=1; fi
  switched=1
  mv "$staging" "$WEB/current"
  [[ ! -e "$BASE/current" || -L "$BASE/current" ]] || { echo 'Unexpected application directory.' >&2; false; }
  ln -sfnT "$release" "$BASE/current"
  install -m 644 "$release/tools/hosting/tatenda-writer.service" /etc/systemd/system/tatenda-writer.service
  systemctl daemon-reload
  systemctl enable tatenda-writer
  systemctl restart tatenda-writer
  local ready=0
  for attempt in {1..20}; do
    if [[ "$(curl -s -o /dev/null -w '%{http_code}' -H 'Host: tatendanyemudzo.com' http://127.0.0.1:3210/write/login || true)" == 200 ]]; then ready=1; break; fi
    sleep 1
  done
  [[ "$ready" == 1 ]] || { echo 'The private editor did not become ready.' >&2; false; }
  cp "$candidate" "$CADDY"
  caddy_applied=1
  systemctl reload caddy 2>/dev/null || systemctl restart caddy
  [[ "$(curl -s -o /dev/null -w '%{http_code}' -H 'Host: tatendanyemudzo.com' http://127.0.0.1/write/login)" == 200 ]]
  touch "$CONFIG/enabled"
  trap - ERR
  echo "Writer setup backup: $backup"
  if [[ "$old_output" == 1 ]]; then printf '%s\n' "$output_backup" > "$backup/output-path"; fi
  echo 'WRITER_SETUP_SUCCESS'
  echo 'Private editor: https://tatendanyemudzo.com/write/'
}

case "$MODE" in
  prepare) prepare;;
  install|update)
    [[ "$REVISION" =~ ^[a-f0-9]{40}$ && -f "$BUNDLE" ]] || { echo 'A committed revision and source archive are required.' >&2; exit 1; }
    [[ -x "$BASE/runtime/bin/node" && -f "$DATA/.ssh/github_ed25519" ]] || { echo 'Run the prepare step first.' >&2; exit 1; }
    source_dir=$(mktemp -d /tmp/tatenda-writer-source.XXXXXX)
    trap 'rm -rf -- "$source_dir"' EXIT
    tar --no-same-owner -xzf "$BUNDLE" -C "$source_dir"
    chmod 755 "$source_dir"
    "$BASE/runtime/bin/node" "$source_dir/tools/writer/lock.mjs" "$DATA/state/publish.lock" -- bash "$0" apply "$REVISION" "$source_dir"
    ;;
  apply) apply "$REVISION" "$BUNDLE";;
  *) echo 'Usage: writer-install.sh prepare | install REVISION SOURCE_ARCHIVE | update REVISION SOURCE_ARCHIVE' >&2; exit 1;;
esac
