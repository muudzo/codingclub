#!/bin/zsh
setopt PIPE_FAIL
umask 077
task_root="${0:A:h}/../.."
cd "$task_root" || exit 1
task_state="$task_root/.local-composer"
mkdir -p -m 700 "$task_state" || exit 1
task_log="$task_state/writer-setup.log"
task_phase="$task_state/writer-setup.phase"
task_exit_file="$task_state/writer-setup.exit"
task_sock="$task_state/ssh-writer.sock"
task_archive="$task_state/writer-source.tar.gz"
printf 'preparing\n' > "$task_phase"
rm -f "$task_exit_file"
[[ ! -f "$task_log" ]] || cp "$task_log" "$task_state/writer-setup.previous.log"
: > "$task_log"

finish() {
  local code="$1"
  printf '%s\n' "$code" > "$task_exit_file"
  if [[ "$code" -eq 0 ]]; then printf 'finished\n' > "$task_phase"; else printf 'failed\n' > "$task_phase"; fi
  echo 'Press any key to close this Terminal window.'
  read -k 1
  exit "$code"
}
[[ "$(git branch --show-current)" == main && -z "$(git status --porcelain)" ]] || { echo 'Merge the validated feature branch into main and commit changes before production setup.'; finish 1; }
git fetch origin main || finish 1
git merge --ff-only origin/main || finish 1
task_revision=$(git rev-parse HEAD)
[[ "$task_revision" == "$(git rev-parse origin/main)" ]] || { echo 'Push main to GitHub before production setup.'; finish 1; }
[[ "$(gh api user --jq .login)" == muudzo ]] || { echo 'The GitHub CLI must be signed in as muudzo.'; finish 1; }
git archive --format=tar.gz --output="$task_archive" HEAD || finish 1
task_remote="/tmp/tatenda-writer-${task_revision}-${RANDOM}"
ssh_opts=(-o ControlMaster=auto -o "ControlPath=$task_sock" -o ControlPersist=5m -o ConnectTimeout=10 -o StrictHostKeyChecking=yes -o ForwardAgent=no)
cleanup() {
  /usr/bin/ssh -O exit -o "ControlPath=$task_sock" muudzo@192.168.2.28 2>/dev/null || true
  rm -f "$task_sock" "$task_archive"
}
trap cleanup EXIT
echo 'Ready to set up private phone publishing on Ubuntu.'
echo 'Your public website stays available while the new service is prepared.'
echo 'Enter the Ubuntu password for SSH/sudo when prompted. Later, choose a separate publishing password.'
printf 'waiting-for-return\n' > "$task_phase"
printf 'Press Return when ready: '
read -rs task_ready || finish 1
unset task_ready
printf '\n'
printf 'preparing-server\n' > "$task_phase"
{
  /usr/bin/ssh "${ssh_opts[@]}" muudzo@192.168.2.28 "mkdir -m 700 '$task_remote'" || exit 1
  /usr/bin/scp "${ssh_opts[@]}" "$task_archive" "tools/hosting/writer-install.sh" "muudzo@192.168.2.28:$task_remote/" || exit 1
  /usr/bin/ssh "${ssh_opts[@]}" -t muudzo@192.168.2.28 "sudo bash '$task_remote/writer-install.sh' prepare"
} 2>&1 | /usr/bin/tee "$task_log"
task_prepare_exit=${pipestatus[1]}
[[ "$task_prepare_exit" -eq 0 ]] || finish "$task_prepare_exit"
printf 'registering-repository-key\n' > "$task_phase"
python3 - "$task_log" "$task_state/writer-key-request.json" <<'PY'
import json,sys
from pathlib import Path
lines=Path(sys.argv[1]).read_text(errors='replace').replace('\r','').splitlines()
keys=[line.split('=',1)[1] for line in lines if line.startswith('WRITER_PUBLIC_KEY=ssh-ed25519 ')]
if len(keys)!=1: raise SystemExit('Could not identify the dedicated server public key.')
Path(sys.argv[2]).write_text(json.dumps({'title':'tatenda phone publisher','key':keys[0],'read_only':False}))
PY
[[ "$?" -eq 0 ]] || finish 1
gh api repos/muudzo/codingclub/keys > "$task_state/writer-existing-keys.json" || finish 1
python3 - "$task_state/writer-key-request.json" "$task_state/writer-existing-keys.json" "$task_state/writer-key.id" <<'PY'
import json,sys
from pathlib import Path
key=json.loads(Path(sys.argv[1]).read_text())['key'].split()[:2]
matches=[entry for entry in json.loads(Path(sys.argv[2]).read_text()) if entry['key'].split()[:2]==key]
if matches and matches[0]['read_only']: raise SystemExit('The server key already exists with read-only access; inspect the repository deploy key.')
Path(sys.argv[3]).write_text(str(matches[0]['id']) if matches else '')
PY
[[ "$?" -eq 0 ]] || finish 1
if [[ ! -s "$task_state/writer-key.id" ]]; then
  gh api --method POST repos/muudzo/codingclub/keys --input "$task_state/writer-key-request.json" --jq .id > "$task_state/writer-key.id" || finish 1
fi
echo 'Registered the server publishing key for muudzo/codingclub.'
printf 'installing-service\n' > "$task_phase"
/usr/bin/ssh "${ssh_opts[@]}" -t muudzo@192.168.2.28 "sudo bash '$task_remote/writer-install.sh' install '$task_revision' '$task_remote/writer-source.tar.gz'" 2>&1 | /usr/bin/tee -a "$task_log"
task_install_exit=${pipestatus[1]}
if [[ "$task_install_exit" -eq 0 ]]; then
  /usr/bin/ssh "${ssh_opts[@]}" muudzo@192.168.2.28 "rm -rf -- '$task_remote'" || true
  echo 'Phone publishing is ready at https://tatendanyemudzo.com/write/'
fi
finish "$task_install_exit"
