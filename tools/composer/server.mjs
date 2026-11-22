import { createServer } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readFile, mkdir, writeFile, realpath, stat } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve, join, extname, sep } from 'node:path';
import { createPublisher, PublishError } from './publish.mjs';
import { readPostForm } from './uploads.mjs';

const ui = join(dirname(fileURLToPath(import.meta.url)), 'ui');
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png', '.jpg': 'image/jpeg' };
const sameToken = (a, b) => typeof a === 'string' && Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export async function startComposer({ root, port = 0, token = randomBytes(32).toString('hex'), build, persist = false } = {}) {
  const publish = createPublisher({ root, build });
  let origin, reading = false;
  const base = `/${(process.env.BASE_PATH || '').replace(/^\/+|\/+$/g, '')}`.replace(/\/$/, '');
  const server = createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' blob:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    const send = (status, data) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data)); };
    try {
      if (req.headers.host !== new URL(origin).host) throw new PublishError('Unexpected local host.', 403);
      const url = new URL(req.url, origin);
      if (url.pathname.startsWith('/api/')) {
        if (!sameToken(req.headers['x-composer-token'], token)) throw new PublishError('Open the composer using your laptop shortcut.', 403);
        if (req.method === 'GET' && url.pathname === '/api/status') return send(200, { composer: 'codingclub', root });
        if (req.method !== 'POST' || url.pathname !== '/api/publish') return send(404, { error: 'Not found.' });
        if (req.headers.origin !== origin) throw new PublishError('Publishing is only available from this composer.', 403);
        if (!req.headers['content-type']?.startsWith('multipart/form-data;')) throw new PublishError('Choose the post and photos in the composer.');
        if (reading) throw new PublishError('A post is being published. Please wait.', 409);
        reading = true;
        try {
          const result = await publish(await readPostForm(req, origin));
          return send(200, { ...result, url: `${origin}${base}${result.route}` });
        } finally { reading = false; }
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') return send(405, { error: 'Method not allowed.' });
      let target, boundary;
      if (url.pathname === '/compose' || url.pathname === '/compose/') { target = join(ui, 'index.html'); boundary = ui; }
      else if (['/compose/composer.css', '/compose/composer.js'].includes(url.pathname)) { boundary = ui; target = join(ui, url.pathname.split('/').at(-1)); }
      else if (url.pathname === '/compose/sentient.woff2') { target = join(root, 'src/assets/fonts/sentient-variable.woff2'); boundary = join(root, 'src/assets/fonts'); }
      else {
        boundary = join(root, 'dist');
        let pathname = decodeURIComponent(url.pathname);
        if (base && (pathname === base || pathname.startsWith(`${base}/`))) pathname = pathname.slice(base.length) || '/';
        target = resolve(boundary, `.${pathname}`);
        if ((await stat(target)).isDirectory()) target = join(target, 'index.html');
      }
      const actual = await realpath(target);
      if (!actual.startsWith(`${await realpath(boundary)}${sep}`)) throw new PublishError('Not found.', 404);
      const bytes = await readFile(actual);
      res.writeHead(200, { 'Content-Type': types[extname(actual)] || 'application/octet-stream' });
      res.end(req.method === 'HEAD' ? undefined : bytes);
    } catch (error) {
      if (res.headersSent) return res.end();
      const status = error instanceof PublishError ? error.status : ['ENOENT', 'ENOTDIR'].includes(error.code) ? 404 : 500;
      if (status === 500) console.error(error.message);
      send(status, { error: error instanceof PublishError ? error.message : status === 404 ? 'Not found.' : 'Publishing failed. Your writing and photos are still here. Try again.' });
    }
  });
  server.requestTimeout = 240000;
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  origin = `http://127.0.0.1:${server.address().port}`;
  if (persist) {
    await mkdir(join(root, '.local-composer'), { recursive: true, mode: 0o700 });
    await writeFile(join(root, '.local-composer/session.json'), JSON.stringify({ origin, token, pid: process.pid }), { mode: 0o600 });
  }
  return { server, origin, token, url: `${origin}/compose/#${token}` };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
  await startComposer({ root, persist: true });
  console.log('Local post composer started.');
}
