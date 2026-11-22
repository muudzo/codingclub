import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runBuild } from '../tools/composer/publish.mjs';

test('failed server build diagnostics survive worktree removal and stay private', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'writer-build-log-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const root = join(directory, 'worktree');
  const logFile = join(directory, 'state/last-build.log');
  await mkdir(root);
  await writeFile(join(root, 'astro.config.mjs'), 'throw new Error("Isolated build diagnostic fixture");');
  await assert.rejects(runBuild(root, join(directory, 'output'), { logFile, remote: true }), /private build details were saved on the server/);
  await rm(root, { recursive: true });
  assert.match(await readFile(logFile, 'utf8'), /Isolated build diagnostic fixture/);
  assert.equal((await stat(logFile)).mode & 0o777, 0o600);
});
