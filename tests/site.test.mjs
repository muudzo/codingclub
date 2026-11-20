import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { deflateSync } from 'node:zlib';
import { parseHTML } from 'linkedom';

const repository = resolve(import.meta.dirname, '..');
const astroPackage = JSON.parse(readFileSync(join(repository, 'node_modules/astro/package.json'), 'utf8'));
const astroBin = join(repository, 'node_modules/astro', astroPackage.bin.astro);

function build(root, extraEnv = {}) {
  const result = spawnSync(process.execPath, [astroBin, 'build'], {
    cwd: root,
    env: { ...process.env, ASTRO_TELEMETRY_DISABLED: '1', SITE_URL: '', BASE_PATH: '/', ...extraEnv },
    encoding: 'utf8', timeout: 120_000,
  });
  assert.equal(result.error, undefined, result.error?.message);
  return { ...result, log: result.stdout + result.stderr };
}

function write(root, path, contents) {
  const target = join(root, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, contents);
}

function page(root, route) {
  return parseHTML(readFileSync(join(root, 'dist', route === '404' ? '404.html' : route, route === '404' ? '' : 'index.html'), 'utf8')).document;
}

function filesBelow(root) {
  return readdirSync(root, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? filesBelow(join(root, entry.name)) : [join(root, entry.name)]);
}

// Produce a real 2048×1536 PNG for image-pipeline testing. It is never website content.
function photoFixture() {
  const crc = buffer => {
    let value = 0xffffffff;
    for (const byte of buffer) {
      value ^= byte;
      for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
    }
    return (value ^ 0xffffffff) >>> 0;
  };
  const chunk = (kind, data) => {
    const type = Buffer.from(kind);
    const length = Buffer.alloc(4); length.writeUInt32BE(data.length);
    const checksum = Buffer.alloc(4); checksum.writeUInt32BE(crc(Buffer.concat([type, data])));
    return Buffer.concat([length, type, data, checksum]);
  };
  const width = 2048, height = 1536;
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 2;
  const scanlines = Buffer.alloc((width * 3 + 1) * height, 128);
  for (let row = 0; row < height; row++) scanlines[row * (width * 3 + 1)] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(scanlines)), chunk('IEND', Buffer.alloc(0))]);
}

function assertLocalLinks(root, base = '/') {
  for (const file of filesBelow(join(root, 'dist')).filter(file => file.endsWith('.html'))) {
    const document = parseHTML(readFileSync(file, 'utf8')).document;
    assert.equal(document.querySelectorAll('h1').length, 1, file);
    assert.equal(document.querySelectorAll('script').length, 0, `${file}: static pages should not ship JavaScript`);
    assert.equal(document.querySelectorAll('[style]').length, 0, `${file}: inline styles violate the static CSP`);
    for (const element of document.querySelectorAll('[href], [src]')) {
      const value = element.getAttribute('href') || element.getAttribute('src');
      if (!value || !value.startsWith('/')) continue;
      assert.ok(value.startsWith(base), `${file}: ${value} must include base ${base}`);
      const local = decodeURIComponent(value.slice(base.length).split('#')[0]);
      const target = join(root, 'dist', local);
      assert.ok(existsSync(target), `${file}: missing local target ${target}`);
    }
  }
}

test('static website works empty and with new entries, excludes drafts, and supports a subdirectory', { timeout: 120_000 }, async t => {
  const root = mkdtempSync(join(tmpdir(), 'tatenda-site-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const name of ['src', 'public', 'astro.config.mjs', 'tsconfig.json', 'package.json']) cpSync(join(repository, name), join(root, name), { recursive: true });
  // Share installed dependencies, while builds and fixtures remain isolated from the real site.
  symlinkSync(join(repository, 'node_modules'), join(root, 'node_modules'), 'dir');
  for (const section of ['apps', 'music', 'photography', 'blog']) {
    for (const file of filesBelow(join(root, 'src/content', section))) rmSync(file);
  }

  await t.test('empty collections have useful pages, no fake entries, no runtime scripts, and working links', () => {
    const result = build(root);
    assert.equal(result.status, 0, result.log);
    assert.equal(filesBelow(join(root, 'dist')).filter(file => file.endsWith('.html')).length, 6);
    for (const [section, text] of [['apps', 'No apps published yet.'], ['music', 'No songs shared yet.'], ['photography', 'No photographs shared yet.'], ['blog', 'No posts published yet.']]) {
      assert.ok(page(root, section).querySelector('main').textContent.includes(text));
    }
    assert.equal(page(root, '').querySelector('link[rel="canonical"]'), null, 'do not invent a domain');
    assertLocalLinks(root);
  });

  await t.test('adding Markdown generates each page type, download/listening links, blog dates, and responsive photographs', () => {
    write(root, 'src/content/apps/test-app.md', '---\ntitle: Fixture app\ndescription: App used only for automated tests.\npublished: true\nversion: "1.2"\nplatform: Test platform\ndownloads:\n  - label: Get test app\n    url: https://downloads.example.test/app.zip\n---\n\n## Instructions\n\nInstall the test app.\n');
    write(root, 'src/content/music/nested/test-song.md', '---\ntitle: Fixture song\ndescription: Song used only for automated tests.\npublished: true\nartist: Fixture artist\nlistenUrl: https://music.example.test/song\n---\n\nA listening note.\n');
    write(root, 'src/assets/photos/test.png', photoFixture());
    write(root, 'src/content/photography/test-photo.md', '---\ntitle: Fixture photo\ndescription: Photo used only for automated tests.\npublished: true\nimage: ../../assets/photos/test.png\nalt: A grey test image.\ncaption: A test caption.\n---\n\nA photograph note.\n');
    write(root, 'src/content/blog/test-post.md', '---\ntitle: Fixture post\ndescription: Post used only for automated tests.\npublished: true\ndate: 2024-01-02\n---\n\n## My thought\n\nA paragraph in a blog post.\n\n```js\nconsole.log("hello");\n```\n');
    write(root, 'src/content/blog/private-draft.md', '---\ntitle: PRIVATE DRAFT TITLE\ndescription: PRIVATE DRAFT DESCRIPTION\npublished: false\ndate: 2024-01-02\n---\nPRIVATE DRAFT BODY\n');
    write(root, 'src/content/blog/not-opted-in.md', '---\ntitle: PRIVATE OMITTED FLAG\ndescription: Must remain hidden without explicit publication.\ndate: 2024-01-02\n---\nPRIVATE OMITTED BODY\n');
    write(root, 'src/content/blog/future-post.md', '---\ntitle: PRIVATE FUTURE TITLE\ndescription: Must wait for a later build.\npublished: true\ndate: 2999-01-01\n---\nPRIVATE FUTURE BODY\n');
    const result = build(root);
    assert.equal(result.status, 0, result.log);
    assert.equal(filesBelow(join(root, 'dist')).filter(file => file.endsWith('.html')).length, 10);
    assert.equal(page(root, 'apps/test-app').querySelector('.download-links a').getAttribute('href'), 'https://downloads.example.test/app.zip');
    assert.equal(page(root, 'music/nested/test-song').querySelector('.listen-link').getAttribute('href'), 'https://music.example.test/song');
    const post = page(root, 'blog/test-post');
    assert.equal(post.querySelector('time').textContent, '2 January 2024');
    assert.ok(post.querySelector('.prose').textContent.includes('A paragraph in a blog post.'));
    const photo = page(root, 'photography/test-photo');
    const image = photo.querySelector('main img');
    assert.equal(image.getAttribute('alt'), 'A grey test image.');
    assert.ok(Number(image.getAttribute('width')) <= 1600);
    assert.ok(image.getAttribute('srcset').includes('480w'));
    assert.ok(image.getAttribute('src').includes('.webp'));
    assert.equal(photo.querySelector('figcaption').textContent, 'A test caption.');
    assert.equal(filesBelow(join(root, 'dist')).some(file => file.endsWith('.png')), false, 'do not publish the original photo');
    const output = filesBelow(join(root, 'dist')).filter(file => /\.(html|json)$/.test(file)).map(file => readFileSync(file, 'utf8')).join('');
    assert.ok(!output.includes('PRIVATE'), 'draft metadata, body, and future entries must stay out of output');
    for (const text of ['1 app', '1 song', '1 photo', '1 post']) assert.ok(page(root, '').querySelector('main').textContent.includes(text));
    assertLocalLinks(root);
  });

  await t.test('subdirectory builds keep page, image, stylesheet, and font links valid', () => {
    const result = build(root, { BASE_PATH: '/personal/', SITE_URL: 'https://site.example.test' });
    assert.equal(result.status, 0, result.log);
    const home = page(root, '');
    assert.equal(home.querySelector('link[rel="canonical"]').getAttribute('href'), 'https://site.example.test/personal/');
    assertLocalLinks(root, '/personal/');
    for (const file of filesBelow(join(root, 'dist')).filter(file => file.endsWith('.css'))) {
      for (const [, url] of readFileSync(file, 'utf8').matchAll(/url\(["']?([^\s)"']+)/g)) {
        assert.ok(url.startsWith('/personal/'), `CSS asset must respect the base: ${url}`);
        assert.ok(existsSync(join(root, 'dist', url.slice('/personal/'.length))));
      }
    }
  });

  await t.test('unpublishing an app removes its route and listing entry on rebuild', () => {
    const file = join(root, 'src/content/apps/test-app.md');
    writeFileSync(file, readFileSync(file, 'utf8').replace('published: true', 'published: false'));
    const result = build(root);
    assert.equal(result.status, 0, result.log);
    assert.equal(existsSync(join(root, 'dist/apps/test-app/index.html')), false);
    assert.ok(!page(root, 'apps').querySelector('main').textContent.includes('Fixture app'));
  });

  await t.test('unsafe download URLs fail the build instead of producing an unsafe link', () => {
    const file = join(root, 'src/content/apps/test-app.md');
    writeFileSync(file, readFileSync(file, 'utf8').replace('published: false', 'published: true').replace('https://downloads.example.test/app.zip', 'javascript:alert(1)'));
    const result = build(root);
    assert.notEqual(result.status, 0, 'invalid downloads must not build');
    assert.match(result.log, /downloads|Invalid|valid/i);
  });
});
