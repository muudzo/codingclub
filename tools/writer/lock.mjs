import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { PublishError } from '../composer/publish.mjs';

export async function withPublishingLock(path, work) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const child = spawn('python3', [fileURLToPath(new URL('./file-lock.py', import.meta.url)), path], { stdio: ['pipe', 'pipe', 'pipe'] });
  child.stderr.resume();
  let held = false;
  const ended = new Promise(resolve => child.once('exit', code => { held = false; resolve(code); }));
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { child.kill(); reject(new PublishError('The publishing lock could not start.', 503)); }, 10000);
    child.once('error', () => { clearTimeout(timer); reject(new PublishError('Python 3 is required for the publishing lock.', 503)); });
    child.once('exit', () => { clearTimeout(timer); reject(new PublishError('Another publication or deployment is running. Please retry shortly.', 409)); });
    child.stdout.once('data', data => {
      clearTimeout(timer);
      if (data.toString().trim() !== 'locked') return reject(new PublishError('Could not acquire the publishing lock.', 503));
      held = true;
      resolve();
    });
  });
  try {
    return await work(() => { if (!held) throw new PublishError('Publishing was interrupted. Your draft can be retried.', 503); });
  } finally {
    child.stdin.end();
    await ended;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [path, separator, command, ...args] = process.argv.slice(2);
  if (!path || separator !== '--' || !command) throw new Error('Usage: lock.mjs PATH -- COMMAND [ARGS]');
  try {
    process.exitCode = await withPublishingLock(path, () => new Promise((resolve, reject) => {
      const child = spawn(command, args, { stdio: 'inherit' });
      child.once('error', reject);
      child.once('exit', code => resolve(code ?? 1));
    }));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
