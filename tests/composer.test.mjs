import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { cp, mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { request } from 'node:http';
import { parseHTML } from 'linkedom';
import { createPublisher, limits } from '../tools/composer/publish.mjs';
import { startComposer } from '../tools/composer/server.mjs';

const require = createRequire(import.meta.url);
const sharp = require(require.resolve('sharp', { paths: [require.resolve('astro/package.json')] }));
const repository = resolve(import.meta.dirname, '..');
const sample = (extra = {}) => ({ id: randomUUID(), title: 'A moment from a walk', text: 'A short note.\nA second line.\n\nAnother paragraph.', ...extra });
const exists = path => stat(path).then(() => true, () => false);
async function fixture(t, site = false) {
  const root = await mkdtemp(join(tmpdir(), 'site-composer-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  if (site) {
    for (const name of ['src', 'public', 'astro.config.mjs', 'tsconfig.json', 'package.json']) await cp(join(repository, name), join(root, name), { recursive: true });
    const config = join(root, 'astro.config.mjs');
    await writeFile(config, (await readFile(config, 'utf8')).replace("cacheDir: process.env.WRITER_ASTRO_CACHE_DIR || undefined,", "cacheDir: './.test-astro-cache/',"));
    for (const section of ['apps', 'music', 'photography', 'blog', 'experiments']) {
      await rm(join(root, 'src/content', section), { recursive: true, force: true });
      await mkdir(join(root, 'src/content', section));
    }
    await symlink(join(repository, 'node_modules'), join(root, 'node_modules'), 'dir');
  }
  return root;
}
async function stubBuild(root, output) {
  const files = (await readdir(join(root, 'src/content/blog'))).filter(name => name.endsWith('.md'));
  for (const file of files) {
    const directory = join(output, 'blog', file.slice(0, -3));
    await mkdir(directory, { recursive: true }); await writeFile(join(directory, 'index.html'), 'Built post');
  }
}
const photo = async () => ({ bytes: await sharp({ create: { width: 1800, height: 1200, channels: 3, background: '#353535' } }).png().toBuffer(), alt: 'A grey image used only in the isolated test.' });

test('publishing text and multiple photos produces real static Blog pages with safe text and responsive assets', { timeout: 180000 }, async t => {
  const root = await fixture(t, true);
  const publish = createPublisher({ root });
  const textPost = await publish(sample({ title: 'Text only' }));
  const photos = [await photo(), await photo()];
  const hashes = photos.map(p => createHash('sha256').update(p.bytes).digest('hex'));
  const input = sample({ title: 'Photos: a "quoted" title', text: '<script>alert("hello")</script>\n# This is plain text.\n\nThe next paragraph.', photos });
  const result = await publish(input);
  const { document } = parseHTML(await readFile(join(root, 'dist', result.route, 'index.html'), 'utf8'));
  assert.ok(document.querySelector('main').textContent.includes(input.text.split('\n')[0]));
  assert.equal(document.querySelectorAll('script').length, 0);
  assert.equal(document.querySelectorAll('h1').length, 1);
  assert.equal(document.querySelector('h1').textContent, input.title);
  assert.equal(document.querySelectorAll('.post-paragraph').length, 2);
  assert.equal(document.querySelectorAll('.post-photos img').length, 2);
  assert.ok(document.querySelector('time').getAttribute('datetime'));
  for (const image of document.querySelectorAll('.post-photos img')) {
    assert.equal(image.getAttribute('alt'), photos[0].alt);
    assert.ok(image.getAttribute('srcset').includes('480w'));
    for (const source of image.getAttribute('srcset').split(',').map(s => s.trim().split(/\s+/)[0])) {
      const metadata = await sharp(join(root, 'dist', source)).metadata();
      assert.equal(metadata.format, 'webp'); assert.ok(metadata.width <= 1600); assert.equal(metadata.exif, undefined);
    }
  }
  const listing = parseHTML(await readFile(join(root, 'dist/blog/index.html'), 'utf8')).document;
  assert.equal(listing.querySelectorAll('.entry-list li').length, 2);
  assert.ok(await exists(join(root, 'dist', textPost.route, 'index.html')));
  assert.deepEqual(photos.map(p => createHash('sha256').update(p.bytes).digest('hex')), hashes);
  assert.deepEqual(await publish(input), result, 'an identical retry returns the same result');
  await assert.rejects(publish({ ...input, text: 'Changed after publishing' }), /already published/);
  assert.equal((await readdir(join(root, 'src/content/blog'))).length, 2);
});

test('invalid input and non-image uploads cannot create published content', async t => {
  const root = await fixture(t);
  const publish = createPublisher({ root, build: stubBuild });
  for (const input of [sample({ title: ' ' }), sample({ text: '' }), sample({ id: '../../escape' }), sample({ text: 'a'.repeat(limits.text + 1) }), sample({ photos: Array(9).fill({}) }), sample({ photos: [{ bytes: Buffer.from('not a photograph'), alt: 'A photo' }] }), sample({ photos: [{ bytes: Buffer.from('test'), alt: '' }] })]) {
    await assert.rejects(publish(input));
  }
  assert.equal(await exists(join(root, 'src/content/blog')), false);
});

test('build failure rolls back new content and preserves the previous build; retry succeeds', async t => {
  const root = await fixture(t);
  await mkdir(join(root, 'dist')); await writeFile(join(root, 'dist/index.html'), 'Previous good build');
  let fail = true;
  const publish = createPublisher({ root, build: async (root, output) => {
    if (fail) { await mkdir(output, { recursive: true }); await writeFile(join(output, 'partial.html'), 'partial'); throw new Error('Deliberate build failure'); }
    await stubBuild(root, output);
  } });
  const input = sample({ photos: [await photo()] });
  await assert.rejects(publish(input), /Deliberate build failure/);
  assert.equal(await readFile(join(root, 'dist/index.html'), 'utf8'), 'Previous good build');
  assert.deepEqual(await readdir(join(root, 'src/content/blog')), []);
  assert.deepEqual(await readdir(join(root, 'src/assets/posts')), []);
  fail = false; const result = await publish(input);
  assert.ok(await exists(join(root, 'dist', result.route, 'index.html')));
});

test('a name collision cannot overwrite an existing post, and concurrent submissions are rejected', async t => {
  const root = await fixture(t);
  const now = () => new Date('2026-11-20T10:00:00.000Z');
  const input = sample({ title: 'Existing post' });
  const directory = join(root, 'src/content/blog'); await mkdir(directory, { recursive: true });
  const file = join(directory, `2026-11-20-existing-post-${input.id}.md`); await writeFile(file, 'Keep this exact content');
  await assert.rejects(createPublisher({ root, now, build: stubBuild })(input));
  assert.equal(await readFile(file, 'utf8'), 'Keep this exact content');
  await rm(file);
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  let started;
  const ready = new Promise(resolve => { started = resolve; });
  const publish = createPublisher({ root, build: async (...args) => { started(); await gate; await stubBuild(...args); } });
  const first = publish(sample()); await ready;
  await assert.rejects(publish(sample()), /being published/);
  release(); await first;
});

test('the loopback API requires its exact host, session token and origin and serves only built output', async t => {
  const root = await fixture(t);
  const { server, origin, token } = await startComposer({ root, build: stubBuild });
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  const form = () => {
    const data = new FormData(); Object.entries(sample()).forEach(([key, value]) => data.set(key, value)); return data;
  };
  const endpoint = `${origin}/api/publish`;
  for (const headers of [{ Origin: origin }, { Origin: origin, 'X-Composer-Token': 'wrong' }, { Origin: 'https://other.example', 'X-Composer-Token': token }]) {
    assert.equal((await fetch(endpoint, { method: 'POST', headers, body: form() })).status, 403);
  }
  const foreignHost = await new Promise((resolve, reject) => {
    const req = request(`${origin}/api/status`, { headers: { 'X-Composer-Token': token, Host: 'evil.example' } }, res => { res.resume(); resolve(res.statusCode); });
    req.on('error', reject); req.end();
  });
  assert.equal(foreignHost, 403);
  assert.equal((await fetch(`${origin}/tools/composer/server.mjs`)).status, 404);
  const response = await fetch(endpoint, { method: 'POST', headers: { Origin: origin, 'X-Composer-Token': token }, body: form() });
  assert.equal(response.status, 200);
  const result = await response.json(); assert.equal((await fetch(result.url)).status, 200);
});
