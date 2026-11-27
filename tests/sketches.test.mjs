import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { writePasswordFile } from '../tools/writer/auth.mjs';
import { startWriter } from '../tools/writer/server.mjs';
import { validateSketchPayload } from '../src/lib/sketches.mjs';

const repository = resolve(import.meta.dirname, '..');

test('sketch payload validator accepts valid strokes, clamps bounds, and rejects unsafe values', () => {
  const valid = validateSketchPayload({
    title: '  Sunset doodle  ',
    author: 'Tatenda',
    strokes: [
      { tool: 'pen', color: '#7d0c14', width: 5, points: [[-10, 20], [900, 600]] },
      { tool: 'circle', color: '#1f1c1c', width: 2, from: [100, 100], to: [200, 200] },
    ],
  });
  assert.equal(valid.ok, true);
  assert.equal(valid.data.title, 'Sunset doodle');
  assert.deepEqual(valid.data.strokes[0].points, [[0, 20], [800, 500]]);

  const badColor = validateSketchPayload({
    title: 'Bad color',
    strokes: [{ tool: 'line', color: 'javascript:alert(1)', width: 5, from: [0, 0], to: [10, 10] }],
  });
  assert.equal(badColor.ok, false);

  const empty = validateSketchPayload({ title: 'Empty', strokes: [] });
  assert.equal(empty.ok, false);
});

test('public sketch submission is rate-limited and owner can approve or reject from /write/', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sketch-writer-'));
  const stateRoot = join(dir, 'state');
  const passwordFile = join(dir, 'password.json');
  mkdirSync(stateRoot, { recursive: true });
  await writePasswordFile(passwordFile, 'correct horse battery staple');

  let approvedTitle = null;
  const writer = await startWriter({
    root: repository,
    stateRoot,
    passwordFile,
    publish: async () => ({ route: '/blog/test/' }),
    approveSketch: async sketch => {
      approvedTitle = sketch.title;
      return { route: '/sketch/' };
    },
    insecureLocalhost: true,
    port: 0,
  });

  try {
    const sample = {
      title: 'Little House',
      author: 'Guest',
      strokes: [{ tool: 'rect', color: '#7d0c14', width: 5, from: [50, 50], to: [150, 150] }],
    };

    const crossOrigin = await fetch(`${writer.origin}/write/api/public/sketch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example' },
      body: JSON.stringify(sample),
    });
    assert.equal(crossOrigin.status, 403);

    for (let i = 0; i < 5; i += 1) {
      const res = await fetch(`${writer.origin}/write/api/public/sketch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: writer.origin },
        body: JSON.stringify({ ...sample, title: `Sketch ${i + 1}` }),
      });
      assert.equal(res.status, 201);
    }

    const throttled = await fetch(`${writer.origin}/write/api/public/sketch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: writer.origin },
      body: JSON.stringify(sample),
    });
    assert.equal(throttled.status, 429);

    const unauthQueue = await fetch(`${writer.origin}/write/api/sketches`);
    assert.equal(unauthQueue.status, 401);

    const loginRes = await fetch(`${writer.origin}/write/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: writer.origin },
      body: JSON.stringify({ password: 'correct horse battery staple' }),
    });
    assert.equal(loginRes.status, 200);
    const cookie = loginRes.headers.get('set-cookie').split(';')[0];

    const sessionRes = await fetch(`${writer.origin}/write/api/session`, { headers: { Cookie: cookie } });
    const { csrf } = await sessionRes.json();

    const queueRes = await fetch(`${writer.origin}/write/api/sketches`, { headers: { Cookie: cookie } });
    assert.equal(queueRes.status, 200);
    const { sketches } = await queueRes.json();
    assert.equal(sketches.length, 5);

    const approveRes = await fetch(`${writer.origin}/write/api/sketches/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: writer.origin, Cookie: cookie, 'x-writer-csrf': csrf },
      body: JSON.stringify({ id: sketches[0].id }),
    });
    assert.equal(approveRes.status, 200);
    assert.equal(approvedTitle, sketches[0].title);

    const rejectRes = await fetch(`${writer.origin}/write/api/sketches/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: writer.origin, Cookie: cookie, 'x-writer-csrf': csrf },
      body: JSON.stringify({ id: sketches[1].id }),
    });
    assert.equal(rejectRes.status, 200);

    const afterRes = await fetch(`${writer.origin}/write/api/sketches`, { headers: { Cookie: cookie } });
    const after = await afterRes.json();
    assert.equal(after.sketches.length, 3);
  } finally {
    await new Promise(r => writer.server.close(r));
    rmSync(dir, { recursive: true, force: true });
  }
});
