import { spawn } from 'node:child_process';
import { readFile, mkdir, rm, stat, open } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = dirname(fileURLToPath(import.meta.url));
const root = resolve(directory, '../..');
const state = join(root, '.local-composer');
const lock = join(state, 'starting');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function active() {
  try {
    const session = JSON.parse(await readFile(join(state, 'session.json'), 'utf8'));
    if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(session.origin)) return;
    const response = await fetch(`${session.origin}/api/status`, { headers: { 'X-Composer-Token': session.token }, signal: AbortSignal.timeout(750) });
    const status = await response.json();
    if (response.ok && status.composer === 'codingclub' && status.root === root) return `${session.origin}/compose/#${session.token}`;
  } catch {}
}

await mkdir(state, { recursive: true, mode: 0o700 });
let url = await active();
if (!url) {
  let owned = false;
  try {
    try { await mkdir(lock); owned = true; }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      if (Date.now() - (await stat(lock)).mtimeMs > 30000) { await rm(lock, { recursive: true }); await mkdir(lock); owned = true; }
    }
    if (owned) {
      // Another launch may have completed between the first check and taking the lock.
      url = await active();
      if (!url) {
        const log = await open(join(state, 'server.log'), 'a', 0o600);
        const child = spawn(process.execPath, [join(directory, 'server.mjs')], { cwd: root, detached: true, stdio: ['ignore', log.fd, log.fd] });
        child.unref(); await log.close();
      }
    }
    for (let attempt = 0; !url && attempt < 40; attempt++) { await sleep(200); url = await active(); }
    if (!url) throw new Error('Could not start the composer. See .local-composer/server.log.');
  } finally { if (owned) await rm(lock, { recursive: true, force: true }); }
}
if (!process.argv.includes('--no-open')) {
  const child = spawn('/usr/bin/open', [url], { stdio: 'ignore' });
  child.on('error', error => { console.error(error.message); process.exitCode = 1; });
}
console.log('Post composer is ready.');
