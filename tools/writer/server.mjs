import { createServer } from 'node:http';
import { isIP } from 'node:net';
import { readFile, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createAuth, equalSecret } from './auth.mjs';
import { createGitPublisher, recoverPublicOutput } from './git-publish.mjs';
import { withPublishingLock } from './lock.mjs';
import { sshEnvironment } from './git.mjs';
import { readBody, readPostForm } from '../composer/uploads.mjs';
import { PublishError } from '../composer/publish.mjs';

const directory = dirname(fileURLToPath(import.meta.url));
const sharedUI = resolve(directory, '../composer/ui');
export const phoneLimits = { imageBytes: 10 * 1024 * 1024, bodyBytes: 82 * 1024 * 1024 };

export async function startWriter({ root, stateRoot, passwordFile, publish, publicOrigin, port = 3210, insecureLocalhost = false }) {
  if (!insecureLocalhost && (!publicOrigin || new URL(publicOrigin).protocol !== 'https:')) throw new Error('The publishing origin must use HTTPS.');
  if (insecureLocalhost && publicOrigin && !/^http:\/\/127\.0\.0\.1(?::\d+)?\/?$/.test(publicOrigin)) throw new Error('Insecure test mode is restricted to loopback.');
  let origin = publicOrigin ? new URL(publicOrigin).origin : undefined;
  const auth = await createAuth({ passwordFile, stateRoot, secure: !insecureLocalhost });
  let reading = false;
  const server = createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' blob:; font-src 'self'; connect-src 'self'; manifest-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    const send = (status, value) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(value)); };
    const redirect = path => { res.writeHead(303, { Location: path }); res.end(); };
    try {
      if (req.headers.host !== new URL(origin).host) throw new PublishError('Unexpected publishing host.', 403);
      const url = new URL(req.url, origin);
      if (url.pathname === '/write') return redirect('/write/');
      if (!url.pathname.startsWith('/write/')) return send(404, { error: 'Not found.' });
      if (!['GET', 'HEAD', 'POST'].includes(req.method)) return send(405, { error: 'Method not allowed.' });
      if (req.method === 'POST' && req.headers.origin !== origin) throw new PublishError('Publishing requests must come from this editor.', 403);
      if (url.pathname === '/write/api/login' && req.method === 'POST') {
        if (!req.headers['content-type']?.startsWith('application/json')) throw new PublishError('Use the sign-in form.');
        let input;
        try { input = JSON.parse((await readBody(req, 8192)).toString()); }
        catch (error) { if (error instanceof PublishError) throw error; throw new PublishError('The sign-in request could not be read.'); }
        const forwarded = req.headers['cf-connecting-ip'];
        const client = typeof forwarded === 'string' && isIP(forwarded) ? forwarded : req.socket.remoteAddress;
        const cookie = await auth.login(input?.password, client);
        if (!cookie) throw new PublishError('That password was not accepted.', 401);
        res.setHeader('Set-Cookie', cookie);
        return send(200, { signedIn: true });
      }
      const session = await auth.session(req.headers.cookie);
      if (url.pathname.startsWith('/write/api/')) {
        if (!session) throw new PublishError('Sign in to publish. Your draft can be retried after signing in.', 401);
        if (url.pathname === '/write/api/session' && req.method === 'GET') return send(200, { csrf: session.csrf, imageBytes: phoneLimits.imageBytes });
        if (req.method !== 'POST') return send(405, { error: 'Method not allowed.' });
        if (!equalSecret(req.headers['x-writer-csrf'], session.csrf)) throw new PublishError('Refresh this editor before publishing.', 403);
        if (url.pathname === '/write/api/logout') { res.setHeader('Set-Cookie', await auth.logout(req.headers.cookie)); return send(200, { signedIn: false }); }
        if (url.pathname !== '/write/api/publish') return send(404, { error: 'Not found.' });
        if (reading) throw new PublishError('A post is being published. Please wait.', 409);
        reading = true;
        try {
          const input = await readPostForm(req, origin, phoneLimits);
          const result = await publish(input);
          return send(200, { ...result, url: `${origin}${result.route}` });
        } finally { reading = false; }
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') return send(405, { error: 'Method not allowed.' });
      let bytes, type;
      if (url.pathname === '/write/' || url.pathname === '/write/login') {
        if (!session && url.pathname === '/write/') return redirect('/write/login');
        if (session && url.pathname === '/write/login') return redirect('/write/');
        const login = url.pathname === '/write/login';
        let html = await readFile(login ? join(directory, 'ui/login.html') : join(sharedUI, 'index.html'), 'utf8');
        if (!login) html = html.replace('<body>', '<body data-mode="remote">').replaceAll('/compose/', '/write/').replace('href="/favicon.svg"', 'href="/write/favicon.svg"').replace('Local publishing', 'Private publishing').replace('Posts appear in your Blog, only on this Mac.', 'Posts appear on your website after publishing.').replace('This local writing tool needs JavaScript. Enable it and open the composer with your laptop shortcut.', 'Enable JavaScript to write and publish.').replace('Up to 15 MB each.', 'Up to 10 MB each.').replace('<span class="scope">Private publishing</span>', '<div class="account-actions"><span class="scope">Private publishing</span><button type="button" class="sign-out" id="sign-out">Sign out</button></div>');
        bytes = Buffer.from(html); type = 'text/html; charset=utf-8';
      } else if (url.pathname === '/write/composer.css') {
        bytes = Buffer.from((await readFile(join(sharedUI, 'composer.css'), 'utf8')).replaceAll('/compose/', '/write/')); type = 'text/css';
      } else if (url.pathname === '/write/composer.js') { bytes = await readFile(join(sharedUI, 'composer.js')); type = 'text/javascript'; }
      else if (url.pathname === '/write/login.js') { bytes = await readFile(join(directory, 'ui/login.js')); type = 'text/javascript'; }
      else if (url.pathname === '/write/sentient.woff2') { bytes = await readFile(join(root, 'src/assets/fonts/sentient-variable.woff2')); type = 'font/woff2'; }
      else if (url.pathname === '/write/favicon.svg') { bytes = await readFile(join(root, 'public/favicon.svg')); type = 'image/svg+xml'; }
      else return send(404, { error: 'Not found.' });
      res.writeHead(200, { 'Content-Type': type }); res.end(req.method === 'HEAD' ? undefined : bytes);
    } catch (error) {
      req.resume();
      if (res.headersSent || res.destroyed) return;
      if (error.retryAfter) res.setHeader('Retry-After', error.retryAfter);
      send(error instanceof PublishError ? error.status : 500, { error: error instanceof PublishError ? error.message : 'Publishing did not finish. Your draft can be retried.' });
    }
  });
  server.requestTimeout = 240000;
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  const listenerOrigin = `http://127.0.0.1:${server.address().port}`;
  if (insecureLocalhost && !origin) origin = listenerOrigin;
  return { server, origin: listenerOrigin, publicOrigin: origin };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const config = JSON.parse(await readFile(process.env.WRITER_CONFIG || '/etc/tatenda-writer/config.json', 'utf8'));
  const root = resolve(directory, '../..');
  const gitEnv = sshEnvironment(config);
  try { await stat(config.publicRoot); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    await withPublishingLock(join(config.stateRoot, 'publish.lock'), () => recoverPublicOutput(config.publicRoot));
  }
  const publish = createGitPublisher({ ...config, dependenciesRoot: root, siteUrl: config.publicOrigin, gitEnv });
  await startWriter({ ...config, root, publish });
  console.log('Private publishing service is listening on loopback.');
}
