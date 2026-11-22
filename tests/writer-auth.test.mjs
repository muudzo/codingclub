import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, stat, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { request } from 'node:http';
import { createAuth, writePasswordFile } from '../tools/writer/auth.mjs';
import { startWriter, phoneLimits } from '../tools/writer/server.mjs';
import { normalisePost } from '../tools/composer/publish.mjs';

const password = 'Fixture-only-owner-password-2026';
async function fixture(t) {
  const stateRoot = await mkdtemp(join(tmpdir(), 'writer-auth-'));
  t.after(() => rm(stateRoot, { recursive: true, force: true }));
  const passwordFile = join(stateRoot, 'owner.json');
  await writePasswordFile(passwordFile, password);
  return { stateRoot, passwordFile };
}

test('owner credentials are hashed, sessions persist, logout revokes, and reset invalidates old sessions', async t => {
  const paths = await fixture(t);
  assert.equal((await readFile(paths.passwordFile, 'utf8')).includes(password), false);
  assert.equal((await stat(paths.passwordFile)).mode & 0o777, 0o600);
  await assert.rejects(writePasswordFile(join(paths.stateRoot, 'short.json'), 'short'), /14/);
  const auth = await createAuth(paths);
  const cookie = await auth.login(password, 'owner');
  assert.match(cookie, /^__Host-tatenda_writer=/);
  for (const attribute of ['Secure', 'HttpOnly', 'SameSite=Strict', 'Path=/']) assert.ok(cookie.includes(attribute));
  const header = cookie.split(';')[0];
  assert.ok((await auth.session(header)).csrf);
  const restarted = await createAuth(paths);
  assert.ok(await restarted.session(header));
  await auth.logout(header);
  assert.equal(await restarted.session(header), null);
  const second = (await auth.login(password, 'owner')).split(';')[0];
  await writePasswordFile(paths.passwordFile, 'Another-fixture-owner-password', { replace: true });
  assert.equal(await (await createAuth(paths)).session(second), null);
});

test('password checking is throttled and sessions expire', async t => {
  const paths = await fixture(t);
  let clock = Date.now();
  const auth = await createAuth({ ...paths, now: () => clock });
  for (let index = 0; index < 5; index++) assert.equal(await auth.login('incorrect fixture password', 'client'), null);
  await assert.rejects(auth.login(password, 'client'), error => error.status === 429);
  clock += 16 * 60 * 1000;
  const cookie = (await auth.login(password, 'client')).split(';')[0];
  clock += 8 * 24 * 60 * 60 * 1000;
  assert.equal(await auth.session(cookie), null);
});

test('remote editor requires login, exact host/origin, CSRF and bounded uploads', async t => {
  const paths = await fixture(t);
  const published = [];
  const { server, origin } = await startWriter({ ...paths, root: resolve(import.meta.dirname, '..'), port: 0, insecureLocalhost: true,
    publish: async input => {
      const value = normalisePost(input);
      published.push(value);
      return { route: '/blog/fixture-post/', title: value.title };
    },
  });
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  const form = () => {
    const value = new FormData();
    value.set('id', randomUUID()); value.set('title', 'Fixture phone post'); value.set('text', 'Only an isolated HTTP fixture.');
    return value;
  };
  const editor = await fetch(origin + '/write/', { redirect: 'manual' });
  assert.equal(editor.status, 303);
  assert.equal(editor.headers.get('location'), '/write/login');
  const loginPage = await fetch(origin + '/write/login');
  assert.equal(loginPage.status, 200);
  assert.match(loginPage.headers.get('cache-control'), /no-store/);
  assert.equal((await fetch(origin + '/write/config.json')).status, 404);
  assert.equal((await fetch(origin + '/write/api/publish', { method: 'POST', headers: { Origin: origin }, body: form() })).status, 401);
  assert.equal((await fetch(origin + '/write/api/login', { method: 'POST', headers: { Origin: 'https://other.example', 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) })).status, 403);
  const login = await fetch(origin + '/write/api/login', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) });
  assert.equal(login.status, 200);
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const sessionResponse = await fetch(origin + '/write/api/session', { headers: { Cookie: cookie } });
  const { csrf } = await sessionResponse.json();
  const page = await fetch(origin + '/write/', { headers: { Cookie: cookie } });
  assert.match(await page.text(), /data-mode="remote"/);
  assert.equal((await fetch(origin + '/write/api/publish', { method: 'POST', headers: { Cookie: cookie, Origin: origin }, body: form() })).status, 403);
  assert.equal((await fetch(origin + '/write/api/publish', { method: 'POST', headers: { Cookie: cookie, Origin: 'https://other.example', 'X-Writer-CSRF': csrf }, body: form() })).status, 403);
  const wrongHost = await new Promise((resolve, reject) => {
    const req = request(origin + '/write/api/session', { headers: { Cookie: cookie, Host: 'other.example' } }, response => { response.resume(); resolve(response.statusCode); });
    req.on('error', reject); req.end();
  });
  assert.equal(wrongHost, 403);
  const tooLarge = await new Promise((resolve, reject) => {
    const req = request(origin + '/write/api/publish', { method: 'POST', headers: { Cookie: cookie, Origin: origin, 'X-Writer-CSRF': csrf, 'Content-Type': 'multipart/form-data; boundary=fixture', 'Content-Length': phoneLimits.bodyBytes + 1 } }, response => { response.resume(); resolve(response.statusCode); });
    req.on('error', reject); req.end('x');
  });
  assert.equal(tooLarge, 413);
  const response = await fetch(origin + '/write/api/publish', { method: 'POST', headers: { Cookie: cookie, Origin: origin, 'X-Writer-CSRF': csrf }, body: form() });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).url, origin + '/blog/fixture-post/');
  assert.equal(published.length, 1);
  const logout = await fetch(origin + '/write/api/logout', { method: 'POST', headers: { Cookie: cookie, Origin: origin, 'X-Writer-CSRF': csrf } });
  assert.equal(logout.status, 200);
  assert.equal((await fetch(origin + '/write/api/session', { headers: { Cookie: cookie } })).status, 401);
  assert.equal(published.length, 1);
});
