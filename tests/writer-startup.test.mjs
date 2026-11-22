import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, symlink, writeFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { request } from 'node:http';
import { writePasswordFile } from '../tools/writer/auth.mjs';

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'writer-startup-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const current = join(root, 'current');
  await symlink(resolve(import.meta.dirname, '..'), current, 'dir');
  return { root, current };
}

test('the systemd entry point starts through the current release symlink and serves login', { timeout: 15000 }, async t => {
  const { root, current } = await fixture(t);
  const passwordFile = join(root, 'owner.json');
  await writePasswordFile(passwordFile, 'Isolated-startup-password');
  const publicRoot = join(root, 'public');
  await mkdir(publicRoot);
  const probe = createServer();
  await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  const config = join(root, 'config.json');
  await writeFile(config, JSON.stringify({ repository: root, stateRoot: join(root, 'state'), publicRoot,
    passwordFile, keyFile: '/tmp/fixture-key', knownHostsFile: '/tmp/fixture-hosts',
    publicOrigin: 'https://site.example.test', port }));
  const child = spawn(process.execPath, [join(current, 'tools/writer/server.mjs')], {
    env: { ...process.env, WRITER_CONFIG: config }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stderr = '';
  child.stderr.on('data', data => { stderr += data; });
  const closed = new Promise(resolve => child.once('exit', resolve));
  t.after(async () => { if (child.exitCode === null) child.kill(); await closed; });
  await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', code => reject(new Error(`Writer exited before readiness (${code}): ${stderr}`)));
    child.stdout.on('data', data => { if (data.toString().includes('listening on loopback')) resolve(); });
  });
  const response = await new Promise((resolve, reject) => {
    const req = request(`http://127.0.0.1:${port}/write/login`, { headers: { Host: 'site.example.test' } }, res => {
      let body = '';
      res.on('data', data => { body += data; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.once('error', reject); req.end();
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.match(response.body, /Sign in/);
});

test('the rollback lock CLI executes its command through a release symlink', async t => {
  const { root, current } = await fixture(t);
  const child = spawn(process.execPath, [join(current, 'tools/writer/lock.mjs'), join(root, 'publish.lock'), '--', process.execPath, '-e', 'console.log("protected-command-ran")'], { stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '', stderr = '';
  child.stdout.on('data', data => { output += data; });
  child.stderr.on('data', data => { stderr += data; });
  assert.equal(await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', resolve); }), 0, stderr);
  assert.match(output, /protected-command-ran/);
});
