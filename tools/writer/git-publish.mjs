import { mkdir, readFile, writeFile, readdir, chmod, rm, symlink, rename, stat } from 'node:fs/promises';
import { join, relative, isAbsolute } from 'node:path';
import { createPublisher, normalisePost, postDigest, runBuild, PublishError } from '../composer/publish.mjs';
import { withPublishingLock } from './lock.mjs';
import { runGit } from './git.mjs';
export { runGit } from './git.mjs';

async function makeReadable(directory) {
  await chmod(directory, 0o755);
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new PublishError('The build contains an unsupported file link.', 500);
    if (entry.isDirectory()) await makeReadable(path);
    else await chmod(path, 0o644);
  }
}

export async function recoverPublicOutput(publicRoot) {
  try { await stat(publicRoot); return; }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const parent = join(publicRoot, '..');
  let entries;
  try { entries = await readdir(parent, { withFileTypes: true }); }
  catch (error) { if (error.code === 'ENOENT') return; throw error; }
  const backups = await Promise.all(entries.filter(entry => entry.isDirectory() && /^previous-[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(entry.name)).map(async entry => {
    const path = join(parent, entry.name);
    return { path, modified: (await stat(path)).mtimeMs };
  }));
  backups.sort((a, b) => b.modified - a.modified);
  if (backups.length) await rename(backups[0].path, publicRoot);
}

export function createGitPublisher({ repository, stateRoot, publicRoot, dependenciesRoot, siteUrl, gitEnv = {}, build = runBuild, now = () => new Date() }) {
  for (const path of [repository, stateRoot, publicRoot, dependenciesRoot]) if (!isAbsolute(path)) throw new Error('Writer filesystem paths must be absolute.');
  let busy = false;
  return async input => {
    if (busy) throw new PublishError('A post is being published. Please wait for it to finish.', 409);
    const post = normalisePost(input);
    const digest = postDigest(post);
    busy = true;
    try {
      return await withPublishingLock(join(stateRoot, 'publish.lock'), async assertHeld => {
        await recoverPublicOutput(publicRoot);
        const receiptFile = join(stateRoot, 'receipts', `${post.id}.json`);
        try {
          const receipt = JSON.parse(await readFile(receiptFile, 'utf8'));
          if (receipt.digest !== digest) throw new PublishError('This request already published different content.', 409);
          return receipt.result;
        } catch (error) { if (error.code !== 'ENOENT') throw error; }
        await mkdir(join(stateRoot, 'requests'), { recursive: true, mode: 0o700 });
        const requestFile = join(stateRoot, 'requests', `${post.id}.json`);
        let request;
        try { request = JSON.parse(await readFile(requestFile, 'utf8')); }
        catch (error) {
          if (error.code !== 'ENOENT') throw error;
          request = { digest, date: now().toISOString() };
          await writeFile(requestFile, JSON.stringify(request), { flag: 'wx', mode: 0o600 });
        }
        if (request.digest !== digest) throw new PublishError('This draft changed after a publishing attempt. Start a new attempt.', 409);
        await runGit(repository, ['fetch', 'origin', 'main'], gitEnv);
        const tree = join(stateRoot, 'worktrees', post.id);
        await mkdir(join(stateRoot, 'worktrees'), { recursive: true, mode: 0o700 });
        // These locations belong solely to this request and are protected by the OS lock.
        await runGit(repository, ['worktree', 'remove', '--force', tree], gitEnv).catch(() => {});
        await rm(tree, { recursive: true, force: true });
        await rm(join(stateRoot, `staging-${post.id}`), { recursive: true, force: true });
        await rm(join(publicRoot, '..', `build-${post.id}`), { recursive: true, force: true });
        await runGit(repository, ['worktree', 'add', '--detach', tree, 'origin/main'], gitEnv);
        try {
          const expected = await readFile(join(dependenciesRoot, 'package-lock.json'));
          if (!expected.equals(await readFile(join(tree, 'package-lock.json')))) throw new PublishError('Deploy the latest site dependencies before publishing this draft.', 409);
          await symlink(join(dependenciesRoot, 'node_modules'), join(tree, 'node_modules'), 'dir');
          const publish = createPublisher({ root: tree, stateRoot, publicRoot, resume: true, now: () => new Date(request.date),
            build: (root, output) => build(root, output, { logFile: join(stateRoot, 'last-build.log'), remote: true, env: { SITE_URL: siteUrl, BASE_PATH: '/', WRITER_ASTRO_CACHE_DIR: join(tree, '.writer-cache') } }),
            beforeActivate: async ({ root, output, post: file, assets }) => {
              assertHeld();
              const paths = [relative(root, file), ...(assets ? [relative(root, assets)] : [])];
              await runGit(root, ['add', '--', ...paths], gitEnv);
              const changed = await runGit(root, ['diff', '--cached', '--name-only'], gitEnv);
              if (changed) {
                await runGit(root, ['commit', '-m', `Publish blog post: ${post.title}`], gitEnv);
                assertHeld();
                await runGit(root, ['push', 'origin', 'HEAD:refs/heads/main'], gitEnv);
              }
              await makeReadable(output);
              assertHeld();
            },
          });
          return await publish(post);
        } finally {
          await runGit(repository, ['worktree', 'remove', '--force', tree], gitEnv).catch(() => {});
        }
      });
    } finally { busy = false; }
  };
}
