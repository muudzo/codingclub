import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createPublisher } from '../tools/composer/publish.mjs';

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'server-publisher-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const root = join(directory, 'source');
  const publicRoot = join(directory, 'public/current');
  const stateRoot = join(directory, 'private');
  await mkdir(root);
  await mkdir(publicRoot, { recursive: true });
  await writeFile(join(publicRoot, 'index.html'), 'Previous public website');
  return { root, publicRoot, stateRoot };
}

async function build(root, output) {
  for (const file of await readdir(join(root, 'src/content/blog'))) {
    const route = join(output, 'blog', file.replace(/\.md$/, ''));
    await mkdir(route, { recursive: true });
    await writeFile(join(route, 'index.html'), 'New public post');
  }
}

const post = () => ({ id: randomUUID(), title: 'A phone post', text: 'A note from the phone.' });
const now = () => new Date('2026-11-22T00:00:00.000Z');

test('server publication checks durable source storage before replacing external public output', async t => {
  const paths = await fixture(t);
  const input = post();
  let fail = true;
  const publish = createPublisher({ ...paths, build, now, beforeActivate: async ({ post: file }) => {
    assert.match(await readFile(file, 'utf8'), /A note from the phone/);
    assert.equal(await readFile(join(paths.publicRoot, 'index.html'), 'utf8'), 'Previous public website');
    if (fail) throw new Error('Source save failed');
  } });
  await assert.rejects(publish(input), /Source save failed/);
  assert.equal(await readFile(join(paths.publicRoot, 'index.html'), 'utf8'), 'Previous public website');
  assert.deepEqual(await readdir(join(paths.root, 'src/content/blog')), []);
  fail = false;
  const result = await publish(input);
  assert.equal(await readFile(join(paths.publicRoot, result.route, 'index.html'), 'utf8'), 'New public post');
  assert.deepEqual(await publish(input), result);
  assert.deepEqual(await readdir(join(paths.publicRoot, '..')), ['current']);
});

test('an explicit server retry can resume identical saved source without overwriting different content', async t => {
  const paths = await fixture(t);
  const input = post();
  let saved;
  await assert.rejects(createPublisher({ ...paths, build, now, beforeActivate: async ({ post: file }) => {
    saved = { file, text: await readFile(file, 'utf8') };
    throw new Error('Activation interrupted after source save');
  } })(input), /interrupted/);
  await writeFile(saved.file, saved.text);
  const result = await createPublisher({ ...paths, build, now, resume: true })(input);
  assert.equal(await readFile(saved.file, 'utf8'), saved.text);
  assert.equal(await readFile(join(paths.publicRoot, result.route, 'index.html'), 'utf8'), 'New public post');
  const otherState = join(paths.stateRoot, 'different-receipts');
  await assert.rejects(createPublisher({ ...paths, stateRoot: otherState, build, now, resume: true })({ ...input, text: 'Different content' }), /different content/);
  assert.equal(await readFile(saved.file, 'utf8'), saved.text);
});
