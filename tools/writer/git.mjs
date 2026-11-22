import { spawn } from 'node:child_process';
import { PublishError } from '../composer/errors.mjs';

export function runGit(root, args, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn('git', ['-C', root, ...args], { env: { ...process.env, GIT_TERMINAL_PROMPT: '0', ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', chunk => { output = (output + chunk).slice(-16000); });
    child.stderr.resume();
    const timer = setTimeout(() => child.kill('SIGTERM'), 60000);
    child.once('error', () => { clearTimeout(timer); reject(new PublishError('Git could not start on the publishing server.', 503)); });
    child.once('exit', code => {
      clearTimeout(timer);
      if (code === 0) resolve(output.trim());
      else reject(new PublishError('Source synchronisation did not finish. Your current website is preserved; retry your draft.', 409));
    });
  });
}

export function sshEnvironment(config) {
  for (const key of ['keyFile', 'knownHostsFile']) if (!/^\/[a-zA-Z0-9/_.-]+$/.test(config[key] || '')) throw new Error('Writer SSH paths must be absolute paths without shell metacharacters.');
  return { GIT_SSH_COMMAND: `ssh -F /dev/null -i ${config.keyFile} -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile=${config.knownHostsFile}` };
}
