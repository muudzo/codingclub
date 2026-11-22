import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { runGit, sshEnvironment } from './git.mjs';

export async function assertDeploymentRevision({ repository, revision, gitEnv = {} }) {
  if (!/^[a-f0-9]{40}$/.test(revision || '')) throw new Error('A committed deployment revision is required.');
  await runGit(repository, ['fetch', 'origin', 'main'], gitEnv);
  const latest = await runGit(repository, ['rev-parse', 'origin/main'], gitEnv);
  if (latest !== revision) throw new Error('GitHub advanced after this build, possibly with a phone post. Synchronise and deploy again; the current website was preserved.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const config = JSON.parse(await readFile('/etc/tatenda-writer/config.json', 'utf8'));
    await assertDeploymentRevision({ repository: config.repository, revision: process.argv[2], gitEnv: sshEnvironment(config) });
    console.log('Deployment revision matches the latest published source.');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
