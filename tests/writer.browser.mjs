import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { chromium } from 'playwright-core';
import { writePasswordFile } from '../tools/writer/auth.mjs';
import { startWriter } from '../tools/writer/server.mjs';
import { normalisePost } from '../tools/composer/publish.mjs';

test('the phone editor preserves photos and retries through browsing and expired sessions at six screen sizes', { timeout: 180000 }, async t => {
  if (!process.env.CHROME_PATH) throw new Error('Set CHROME_PATH to an already installed Chrome/Chromium executable. No browser is downloaded by this test.');
  const root = resolve(import.meta.dirname, '..');
  const stateRoot = await mkdtemp(join(tmpdir(), 'writer-browser-'));
  const passwordFile = join(stateRoot, 'owner.json');
  const password = 'Isolated-browser-fixture-password';
  await writePasswordFile(passwordFile, password);
  const received = [];
  let failNext = false, interrupted;
  const { server, origin } = await startWriter({ root, stateRoot, passwordFile, port: 0, insecureLocalhost: true,
    publish: async input => {
      const value = normalisePost(input);
      if (failNext) { failNext = false; interrupted = value; throw new Error('Isolated simulated interruption'); }
      received.push(value);
      return { title: value.title, route: `/blog/browser-fixture-${received.length}/` };
    },
  });
  t.after(async () => {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    await rm(stateRoot, { recursive: true, force: true });
  });
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, headless: true });
  t.after(() => browser.close());
  const out = join(root, '.taste-skill/inspect-writer');
  await mkdir(out, { recursive: true });
  const require = createRequire(import.meta.url);
  const sharp = require(require.resolve('sharp', { paths: [require.resolve('astro/package.json')] }));
  const picture = await sharp({ create: { width: 320, height: 200, channels: 3, background: '#d6d6d6' } }).png().toBuffer();
  const sizes = [[1440, 1000], [768, 1000], [390, 844], [414, 896], [414, 715], [896, 414]];
  for (const [width, height] of sizes) {
    const context = await browser.newContext({ viewport: { width, height }, isMobile: width < 600 });
    // Serve the built public pages on this isolated writer's origin so owner visibility
    // uses its real session cookie. Publishing still only calls the stub above.
    await context.route(origin + '/**', async route => {
      const path = new URL(route.request().url()).pathname;
      if (path.startsWith('/write/')) return route.continue();
      try {
        const file = join(root, 'dist', path, path.endsWith('/') ? 'index.html' : '');
        const contentType = path.endsWith('.js') ? 'text/javascript' : path.endsWith('.css') ? 'text/css' : path.endsWith('.woff2') ? 'font/woff2' : 'text/html';
        await route.fulfill({ status: 200, contentType, body: await readFile(file) });
      } catch { await route.fulfill({ status: 404, body: 'Not found' }); }
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin + '/');
    await page.waitForLoadState('networkidle');
    assert.equal(await page.locator('.owner-tools').isVisible(), false);
    await page.goto(origin + '/write/');
    await page.locator('#password').fill(password);
    await page.screenshot({ path: join(out, `login-${width}-${height}.png`), fullPage: true });
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.waitForURL(origin + '/write/');
    await page.waitForFunction(() => !document.querySelector('#publish').disabled);
    await page.locator('#title').fill('Browser fixture ' + width);
    await page.locator('#text').fill('An isolated browser post. This is never published to the real website.');
    await page.locator('#photos').setInputFiles({ name: 'fixture.png', mimeType: 'image/png', buffer: picture });
    await page.locator('#photo-list textarea').fill('A grey fixture image.');
    await page.locator('#photo-list img').evaluate(image => image.decode());
    await page.locator('#draft-status').filter({ hasText: 'Draft saved on this device.' }).waitFor();
    page.on('dialog', dialog => dialog.accept());
    await page.reload();
    await page.waitForFunction(() => !document.querySelector('#publish').disabled);
    assert.equal(await page.locator('#title').inputValue(), 'Browser fixture ' + width);
    assert.equal(await page.locator('#photo-list textarea').inputValue(), 'A grey fixture image.');
    const manifest = await (await context.request.get(origin + '/write/app.webmanifest')).json();
    assert.equal(manifest.start_url, '/write/');
    for (const icon of manifest.icons) assert.equal((await context.request.get(origin + icon.src)).status(), 200);
    const layout = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth - innerWidth,
      background: getComputedStyle(document.documentElement).backgroundColor,
      font: getComputedStyle(document.documentElement).fontFamily,
      accent: getComputedStyle(document.querySelector('#publish')).backgroundColor,
      inputSize: parseFloat(getComputedStyle(document.querySelector('#title')).fontSize),
    }));
    assert.ok(layout.overflow <= 1, `overflow at ${width}`);
    assert.equal(layout.background, 'rgb(226, 226, 226)');
    assert.match(layout.font, /Sentient/);
    assert.equal(layout.accent, 'rgb(125, 12, 20)');
    assert.ok(layout.inputSize >= 16);
    const smallTargets = await page.locator('button:visible, a:visible, input:not([type=file]):visible, textarea:visible').evaluateAll(nodes => nodes.filter(node => { const box = node.getBoundingClientRect(); return box.width < 44 || box.height < 44; }).map(node => node.id || node.textContent));
    assert.deepEqual(smallTargets, [], `touch targets at ${width}x${height}`);
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({ path: join(out, `editor-${width}-${height}.png`), fullPage: true });
    if (width === 390) {
      await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'editor supports enlarged text');
      await page.evaluate(() => { document.documentElement.style.fontSize = ''; });
    }
    await page.getByRole('link', { name: 'Back to site', exact: true }).click();
    await page.waitForURL(origin + '/');
    await page.getByRole('link', { name: 'New post', exact: true }).waitFor();
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({ path: join(out, `owner-${width}-${height}.png`), fullPage: true });
    await page.getByRole('link', { name: 'New post', exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('#publish').disabled);
    assert.equal(await page.locator('#title').inputValue(), 'Browser fixture ' + width);
    assert.equal(await page.locator('#photo-list textarea').inputValue(), 'A grey fixture image.');
    const nextPost = received.length + 1;
    if (width === 390) {
      await context.clearCookies();
      await page.getByRole('button', { name: 'Publish post', exact: true }).click();
      await page.locator('#sign-in-again').waitFor();
      assert.equal(await page.locator('#publish').isDisabled(), true);
      const expiredDraft = await page.evaluate(() => window.WriterDraft.load());
      await page.locator('#sign-in-again').click();
      await page.waitForURL(origin + '/write/login');
      await page.locator('#password').fill(password);
      await page.getByRole('button', { name: 'Sign in', exact: true }).click();
      await page.waitForURL(origin + '/write/');
      await page.waitForFunction(() => !document.querySelector('#publish').disabled);
      assert.equal(await page.locator('#title').inputValue(), 'Browser fixture ' + width);
      assert.equal(await page.locator('#photo-list textarea').inputValue(), 'A grey fixture image.');
      assert.equal(await page.evaluate(async () => (await window.WriterDraft.load()).id), expiredDraft.id);
      failNext = true;
      await page.getByRole('button', { name: 'Publish post', exact: true }).click();
      await page.locator('#status.error').waitFor();
      await page.reload();
      await page.waitForFunction(() => !document.querySelector('#publish').disabled);
    }
    await page.getByRole('button', { name: 'Publish post', exact: true }).click();
    await page.waitForURL(origin + `/blog/browser-fixture-${nextPost}/`);
    if (width === 390) assert.equal(received.at(-1).id, interrupted.id, 'reload preserves the attempted request identity');
    await page.goto(origin + '/write/');
    await page.waitForFunction(() => !document.querySelector('#publish').disabled);
    assert.equal(await page.locator('#title').inputValue(), '');
    assert.equal(await page.locator('#photo-list textarea').count(), 0);
    if (width === 390) {
      await page.locator('#title').fill('Keep this draft open');
      await page.evaluate(() => { window.WriterDraft.save = async () => { throw new Error('Isolated storage failure'); }; });
      await page.getByRole('link', { name: 'Back to site', exact: true }).click();
      await page.locator('#status.error').waitFor();
      assert.equal(page.url(), origin + '/write/');
      assert.equal(await page.locator('#title').inputValue(), 'Keep this draft open');
    }
    assert.equal(errors.length, 0, errors.join('\n'));
    await context.close();
  }
  assert.equal(received.length, sizes.length);
  for (const input of received) {
    assert.equal(input.photos.length, 1);
    assert.equal(input.photos[0].alt, 'A grey fixture image.');
    assert.ok(input.photos[0].bytes.equals(picture));
  }
});
