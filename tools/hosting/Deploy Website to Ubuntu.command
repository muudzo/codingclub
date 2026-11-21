#!/bin/zsh
# Open this file in native Terminal to deploy the website to the Ubuntu server.
setopt PIPE_FAIL
task_root="${0:A:h}/../.."
task_state="$task_root/.local-composer"
mkdir -p -m 700 -- "$task_state" || exit 1
task_log="$task_state/deploy.log"
task_status="$task_state/deploy.exit"
task_phase="$task_state/deploy.phase"
task_ssh_log="$task_state/deploy.ssh.log"
task_sock="$task_state/ssh-deploy.sock"
tarball="$task_state/tatendanyemudzo-dist.tar.gz"
umask 077

if [[ -f "$task_log" ]]; then
  cp -- "$task_log" "$task_state/deploy.previous.log" || exit 1
fi
rm -f -- "$task_status" "$task_sock"

echo "=== Deploying tatendanyemudzo.com to Ubuntu Server (192.168.2.28) ==="
echo ""

# Step 1: Build the static website
printf 'building\n' > "$task_phase"
echo "[1/4] Building static site with SITE_URL=https://tatendanyemudzo.com..."
cd "$task_root" || exit 1
ASTRO_TELEMETRY_DISABLED=1 SITE_URL=https://tatendanyemudzo.com npm run build || {
  echo "Build failed. Aborting deployment." >&2
  printf 'build-failed\n' > "$task_phase"
  exit 1
}

# Step 2: Package dist/
printf 'packaging\n' > "$task_phase"
echo "[2/4] Packaging dist into tarball..."
COPYFILE_DISABLE=1 tar --no-xattrs -czf "$tarball" -C "$task_root/dist" . 2>/dev/null || COPYFILE_DISABLE=1 tar -czf "$tarball" -C "$task_root/dist" . || {
  echo "Packaging failed. Aborting." >&2
  printf 'package-failed\n' > "$task_phase"
  exit 1
}

# Step 3: Interactive authentication prompt
echo ""
echo "[3/4] Ready to connect to muudzo@192.168.2.28."
echo "The server connection will start only after you press Return."
echo "Then enter the password for the Ubuntu account muudzo (not your Mac password)."
echo "If requested, also enter the sudo password on Ubuntu."
echo "Password input is hidden; this is normal."
printf 'waiting-for-return\n' > "$task_phase"
printf '\nPress Return when you are ready to enter the Ubuntu password: '
read -rs task_ready || exit 1
unset task_ready
printf '\n'

: > "$task_ssh_log"
printf 'connecting\n' > "$task_phase"

cleanup_ssh() {
  /usr/bin/ssh -O exit -o ControlPath="$task_sock" muudzo@192.168.2.28 2>/dev/null || true
  rm -f -- "$task_sock" "$tarball"
}
trap cleanup_ssh EXIT

# Common SSH options with multiplexing
ssh_opts=(
  -o "ControlMaster=auto"
  -o "ControlPath=$task_sock"
  -o "ControlPersist=5m"
  -o "ConnectTimeout=10"
  -o "StrictHostKeyChecking=yes"
  -o "ForwardAgent=no"
)

{
  echo "--- Step: Establishing SSH connection and transferring files ---"
  /usr/bin/scp "${ssh_opts[@]}" "$tarball" muudzo@192.168.2.28:/tmp/tatendanyemudzo-dist.tar.gz || exit 1
  /usr/bin/scp "${ssh_opts[@]}" "$task_root/tools/hosting/server-deploy.sh" muudzo@192.168.2.28:/tmp/server-deploy.sh || exit 1

  echo ""
  echo "--- Step: Executing remote deployment script with sudo ---"
  /usr/bin/ssh "${ssh_opts[@]}" -t muudzo@192.168.2.28 'sudo bash /tmp/server-deploy.sh /tmp/tatendanyemudzo-dist.tar.gz && rm -f /tmp/server-deploy.sh'
} 2>&1 | /usr/bin/tee "$task_log"

task_exit=${pipestatus[1]}
printf '%s\n' "$task_exit" > "$task_status"

echo ""
if [[ "$task_exit" -eq 0 ]]; then
  printf 'finished\n' > "$task_phase"
  echo "=== Deployment finished successfully! ==="
else
  printf 'failed\n' > "$task_phase"
  echo "=== Deployment stopped with error (exit code $task_exit). ==="
fi

echo ""
echo "Press any key to close this terminal."
read -k 1
exit "$task_exit"
