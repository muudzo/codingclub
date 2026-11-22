import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, readFile, rm, rename } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createGitPublisher, runGit } from '../tools/writer/git-publish.mjs';
import { withPublishingLock } from '../tools/writer/lock.mjs';
import { createPublisher } from '../tools/composer/publish.mjs';
import { assertDeploymentRevision } from '../tools/writer/check-revision.mjs';

function git(root, ...args) {
  const result = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'writer-git-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const seed = join(root, 'seed');
  const remote = join(root, 'remote.git');
  const repository = join(root, 'repository');
  const stateRoot = join(root, 'state');
  const publicRoot = join(root, 'public/current');
  await mkdir(seed);
  await mkdir(join(seed, 'node_modules'));
  await mkdir(publicRoot, { recursive: true });
  await writeFile(join(publicRoot, 'index.html'), 'Previous public website');
  await writeFile(join(seed, 'package-lock.json'), '{"lockfileVersion":3}\n');
  await writeFile(join(seed, '.gitignore'), 'node_modules/\n.local-composer/\n.writer-cache/\n');
  git(seed, 'init', '-b', 'main');
  git(seed, 'config', 'user.name', 'Writer fixture');
  git(seed, 'config', 'user.email', 'fixture@example.test');
  git(seed, 'add', '.');
  git(seed, 'commit', '-m', 'Initial fixture');
  git(root, 'init', '--bare', remote);
  git(seed, 'remote', 'add', 'origin', remote);
  git(seed, 'push', 'origin', 'main');
  git(root, 'clone', '--branch', 'main', remote, repository);
  git(repository, 'config', 'user.name', 'Writer fixture');
  git(repository, 'config', 'user.email', 'fixture@example.test');
  return { root, seed, remote, repository, stateRoot, publicRoot, dependenciesRoot: seed, siteUrl: 'https://site.example.test', build, now };
}

const now = () => new Date('2026-11-22T00:00:00.000Z');
test('deployment rejects a revision made stale by a phone post', async t => {
  const paths = await fixture(t);
  const revision = git(paths.repository, 'rev-parse', 'HEAD');
  await assertDeploymentRevision({ repository: paths.repository, revision });
  await createGitPublisher(paths)(post('A newer phone post'));
  await assert.rejects(assertDeploymentRevision({ repository: paths.repository, revision }), /GitHub advanced/);
  await assertDeploymentRevision({ repository: paths.repository, revision: git(paths.remote, 'rev-parse', 'main') });
});
const post = title => ({ id: randomUUID(), title, text: 'A fixture post, never real website content.' });
async function build(root, output) {
  const { readdir } = await import('node:fs/promises');
  const names = (await readdir(join(root, 'src/content/blog'))).filter(name => name.endsWith('.md'));
  await mkdir(output, { recursive: true });
  await writeFile(join(output, 'index.html'), names.join('\n'));
  for (const name of names) {
    const path = join(output, 'blog', name.replace(/\.md$/, ''));
    await mkdir(path, { recursive: true });
    await writeFile(join(path, 'index.html'), await readFile(join(root, 'src/content/blog', name)));
  }
}

test('phone posts save to Git before activation and preserve earlier posts and retry identity', async t => {
  const paths = await fixture(t);
  const publish = createGitPublisher(paths);
  const input = post('First phone post');
  const first = await publish(input);
  assert.match(git(paths.remote, 'show', `main:src/content/blog/${first.route.split('/')[2]}.md`), /First phone post/);
  assert.deepEqual(await publish(input), first);
  await assert.rejects(publish({ ...input, text: 'Changed after success' }), /different content/);
  const second = await publish(post('Second phone post'));
  const listing = await readFile(join(paths.publicRoot, 'index.html'), 'utf8');
  assert.ok(listing.includes(first.route.split('/')[2]));
  assert.ok(listing.includes(second.route.split('/')[2]));
  assert.equal(git(paths.remote, 'rev-list', '--count', 'main'), '3');
  assert.equal(git(paths.repository, 'status', '--porcelain'), '');
});

test('a rejected Git push preserves public output and a retry can finish without duplicating the post', async t => {
  const paths = await fixture(t);
  const hook = join(paths.remote, 'hooks/pre-receive');
  await writeFile(hook, '#!/bin/sh\nexit 1\n', { mode: 0o755 });
  const publish = createGitPublisher(paths);
  const input = post('Retry after rejected push');
  await assert.rejects(publish(input), /Source synchronisation/);
  assert.equal(await readFile(join(paths.publicRoot, 'index.html'), 'utf8'), 'Previous public website');
  assert.equal(git(paths.remote, 'rev-list', '--count', 'main'), '1');
  await rm(hook);
  const result = await publish(input);
  assert.ok((await readFile(join(paths.publicRoot, 'index.html'), 'utf8')).includes(result.route.split('/')[2]));
  assert.equal(git(paths.remote, 'rev-list', '--count', 'main'), '2');
});

test('retry resumes source that reached Git before activation was interrupted', async t => {
  const paths = await fixture(t);
  const input = post('Saved before interruption');
  await assert.rejects(createPublisher({ root: paths.seed, stateRoot: paths.stateRoot, publicRoot: paths.publicRoot, build, now,
    beforeActivate: async ({ root, post: file }) => {
      const relative = file.slice(root.length + 1);
      await runGit(root, ['add', '--', relative]);
      await runGit(root, ['commit', '-m', 'Saved source fixture']);
      await runGit(root, ['push', 'origin', 'HEAD:refs/heads/main']);
      throw new Error('Interrupted before activation');
    },
  })(input), /Interrupted/);
  assert.equal(await readFile(join(paths.publicRoot, 'index.html'), 'utf8'), 'Previous public website');
  const result = await createGitPublisher(paths)(input);
  assert.match(await readFile(join(paths.publicRoot, result.route, 'index.html'), 'utf8'), /Saved before interruption/);
  assert.equal(git(paths.remote, 'rev-list', '--count', 'main'), '2', 'resuming must not make a duplicate source commit');
});

test('the OS lock serialises publishing and deployment, then releases normally', async t => {
  const root = await mkdtemp(join(tmpdir(), 'writer-lock-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const path = join(root, 'publish.lock');
  let release, ready;
  const gate = new Promise(resolve => { release = resolve; });
  const started = new Promise(resolve => { ready = resolve; });
  const first = withPublishingLock(path, async held => { ready(); await gate; held(); });
  await started;
  await assert.rejects(withPublishingLock(path, async () => {}), /Another publication/);
  release();
  await first;
  assert.equal(await withPublishingLock(path, async held => { held(); return 'released'; }), 'released');
});

test('an interrupted output swap restores the previous website before a new build starts', async t => {
  const paths = await fixture(t);
  await rename(paths.publicRoot, join(paths.publicRoot, '..', `previous-${randomUUID()}`));
  let restored = false;
  const publish = createGitPublisher({ ...paths, build: async (...args) => {
    restored = await readFile(join(paths.publicRoot, 'index.html'), 'utf8') === 'Previous public website';
    await build(...args);
  } });
  await publish(post('After interruption'));
  assert.equal(restored, true);
});
