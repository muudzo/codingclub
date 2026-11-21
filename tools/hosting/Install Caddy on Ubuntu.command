#!/bin/zsh
# Open this file in native Terminal so SSH/sudo authenticate directly with the user.
setopt PIPE_FAIL
task_root="${0:A:h}/../.."
task_state="$task_root/.local-composer"
mkdir -p -m 700 -- "$task_state" || exit 1
task_log="$task_state/caddy-install.log"
task_status="$task_state/caddy-install.exit"
task_phase="$task_state/caddy-install.phase"
task_ssh_log="$task_state/caddy-install.ssh.log"
umask 077
if [[ -f "$task_log" ]]; then
  cp -- "$task_log" "$task_state/caddy-install.previous.log" || exit 1
fi
rm -f -- "$task_status"

remote_command=$(/usr/bin/python3 - "$task_root/tools/hosting/install-caddy-ubuntu.sh" <<'PY'
from pathlib import Path
import shlex
import sys
print('bash -c ' + shlex.quote(Path(sys.argv[1]).read_text()))
PY
) || exit 1

echo 'Installing Caddy on muudzo@192.168.2.28.'
echo 'The server connection will start only after you press Return.'
echo 'Then enter the password for the Ubuntu account muudzo (not your Mac password).'
echo 'Enter your SSH password, then your sudo password if requested.'
echo 'Password input is hidden; this is normal.'
printf 'waiting-for-return\n' > "$task_phase"
printf '\nPress Return when you are ready to enter the Ubuntu password: '
read -rs task_ready || exit 1
unset task_ready
printf '\n'
: > "$task_ssh_log"
printf 'connecting\n' > "$task_phase"
/usr/bin/ssh -vv -E "$task_ssh_log" -t -o ConnectTimeout=10 -o StrictHostKeyChecking=yes -o ForwardAgent=no -o NumberOfPasswordPrompts=1 \
  muudzo@192.168.2.28 "$remote_command" 2>&1 | /usr/bin/tee "$task_log"
task_exit=${pipestatus[1]}
printf '%s\n' "$task_exit" > "$task_status"
if [[ "$task_exit" -eq 0 ]]; then
  printf 'finished\n' > "$task_phase"
  echo 'Installation finished. You can return to Codex.'
else
  printf 'failed\n' > "$task_phase"
  if grep -q '^Caddy verification: already installed and active\.$' "$task_log"; then
    printf 'verified-with-session-error\n' > "$task_phase"
    echo "Caddy is installed and active. The SSH session returned exit $task_exit afterward; its diagnostics are saved."
  else
    echo "Installation stopped (exit $task_exit). Return to Codex to review the result."
  fi
  tail -n 5 -- "$task_ssh_log"
fi
echo 'Press any key to close this installer.'
read -k 1
exit "$task_exit"
