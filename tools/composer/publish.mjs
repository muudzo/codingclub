import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile, rename, rm, access } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { createRequire } from 'node:module';

// Reuse the image processor installed with Astro, without a second image toolchain.
const require = createRequire(import.meta.url);
const sharp = require(require.resolve('sharp', { paths: [require.resolve('astro/package.json')] }));
export const limits = { photos: 8, imageBytes: 15 * 1024 * 1024, bodyBytes: 125 * 1024 * 1024, text: 20000, title: 120 };

export class PublishError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
const exists = async path => access(path).then(() => true, () => false);

export function runBuild(root, output) {
  return new Promise((resolve, reject) => {
    const astroPackage = require('astro/package.json');
    const astro = join(dirname(require.resolve('astro/package.json')), astroPackage.bin.astro);
    const child = spawn(process.execPath, [astro, 'build', '--outDir', output], {
      cwd: root, env: { ...process.env, ASTRO_TELEMETRY_DISABLED: '1' }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    let log = '';
    const record = chunk => { log = (log + chunk.toString()).slice(-24000); };
    child.stdout.on('data', record);
    child.stderr.on('data', record);
    const timeout = setTimeout(() => child.kill('SIGTERM'), 180000);
    child.on('error', error => { clearTimeout(timeout); reject(error); });
    child.on('exit', async code => {
      clearTimeout(timeout);
      if (code === 0) return resolve();
      await writeFile(join(root, '.local-composer/last-build.log'), log).catch(() => {});
      reject(new PublishError('The site could not build. Your post was not published. Your writing and photos are still here; fix the build error and try again. Details: .local-composer/last-build.log', 500));
    });
  });
}

export function createPublisher({ root, build = runBuild, now = () => new Date() }) {
  let busy = false;
  return async ({ id, title, text, photos = [] }) => {
    if (busy) throw new PublishError('A post is being published. Please wait for it to finish.', 409);
    if (typeof id !== 'string' || !/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(id)) throw new PublishError('Reopen the composer and try again.');
    if (typeof title !== 'string' || !title.trim() || title.trim().length > limits.title) throw new PublishError('Add a title of 1–120 characters.');
    if (typeof text !== 'string' || !text.trim() || text.length > limits.text) throw new PublishError('Write a post of 1–20,000 characters.');
    if (!Array.isArray(photos) || photos.length > limits.photos) throw new PublishError('Attach no more than 8 photos.');
    for (const photo of photos) {
      if (!Buffer.isBuffer(photo.bytes) || !photo.bytes.length || photo.bytes.length > limits.imageBytes) throw new PublishError('Each photo must be smaller than 15 MB.');
      if (typeof photo.alt !== 'string' || !photo.alt.trim() || photo.alt.trim().length > 400) throw new PublishError('Describe each photo in 1–400 characters.');
    }
    title = title.trim(); text = text.trim().replace(/\r\n?/g, '\n');
    const fingerprint = createHash('sha256').update(JSON.stringify([title, text, ...photos.map(p => p.alt.trim())]));
    for (const photo of photos) fingerprint.update(photo.bytes);
    const digest = fingerprint.digest('hex');
    const state = join(root, '.local-composer');
    const receiptPath = join(state, 'receipts', `${id}.json`);
    busy = true;
    let staging, assets, post, output, backup;
    let staged = false, assetInstalled = false, postInstalled = false, oldMoved = false, newMoved = false, committed = false;
    try {
      if (await exists(receiptPath)) {
        const receipt = JSON.parse(await readFile(receiptPath, 'utf8'));
        if (receipt.digest !== digest) throw new PublishError('This post was already published. Start a new post to change it.', 409);
        return receipt.result;
      }
      const date = now().toISOString();
      const name = title.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'post';
      const slug = `${date.slice(0, 10)}-${name}-${id}`;
      staging = join(state, `staging-${id}`);
      assets = join(root, 'src/assets/posts', slug);
      post = join(root, 'src/content/blog', `${slug}.md`);
      output = join(state, `build-${id}`);
      backup = join(state, `previous-${id}`);
      await mkdir(state, { recursive: true, mode: 0o700 });
      await mkdir(staging); // A stale transaction is never silently overwritten.
      staged = true;
      const entries = [];
      for (let index = 0; index < photos.length; index++) {
        const photo = photos[index];
        const filename = `photo-${index + 1}.webp`;
        try {
          const image = sharp(photo.bytes, { limitInputPixels: 60_000_000, failOn: 'warning' });
          const metadata = await image.metadata();
          if (!['jpeg', 'png', 'webp', 'heif'].includes(metadata.format) || (metadata.pages ?? 1) > 1) throw new Error('Unsupported image');
          await image.rotate().resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true }).webp({ quality: 85 }).toFile(join(staging, filename));
        } catch {
          throw new PublishError(`Photo ${index + 1} could not be read. Choose a still JPG, PNG, WebP or AVIF image, up to 60 megapixels.`);
        }
        entries.push({ image: `../../assets/posts/${slug}/${filename}`, alt: photo.alt.trim() });
      }
      await mkdir(join(root, 'src/content/blog'), { recursive: true });
      if (photos.length) {
        await mkdir(join(root, 'src/assets/posts'), { recursive: true });
        if (await exists(assets)) throw new PublishError('This photo folder already exists. Start a new post.', 409);
        await rename(staging, assets); assetInstalled = true;
      }
      const fields = { title, description: text.replace(/\s+/g, ' ').slice(0, 240), published: true, date, plainText: text, photos: entries };
      const markdown = `---\n${Object.entries(fields).map(([key, value]) => `${key}: ${JSON.stringify(value)}`).join('\n')}\n---\n`;
      await writeFile(post, markdown, { flag: 'wx' }); postInstalled = true;
      await build(root, output);
      const route = `/blog/${slug}/`;
      if (!await exists(join(output, route, 'index.html'))) throw new PublishError('The build did not create the post page. Your post was not published.', 500);
      const dist = join(root, 'dist');
      if (await exists(dist)) { await rename(dist, backup); oldMoved = true; }
      await rename(output, dist); newMoved = true;
      const result = { route, title, date };
      await mkdir(join(state, 'receipts'), { recursive: true });
      await writeFile(receiptPath, JSON.stringify({ digest, result }), { flag: 'wx', mode: 0o600 });
      committed = true;
      return result;
    } finally {
      if (!committed) {
        if (postInstalled) await rm(post, { force: true });
        if (assetInstalled) await rm(assets, { recursive: true, force: true });
        if (newMoved) await rm(join(root, 'dist'), { recursive: true, force: true });
        if (oldMoved) await rename(backup, join(root, 'dist'));
      }
      if (staged) await rm(staging, { recursive: true, force: true });
      if (output) await rm(output, { recursive: true, force: true });
      if (committed && backup) await rm(backup, { recursive: true, force: true }).catch(() => {});
      busy = false;
    }
  };
}
