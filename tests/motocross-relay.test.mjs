import test from 'node:test';
import assert from 'node:assert/strict';
import { startRelay } from '../tools/motocross-relay/server.mjs';

function connectWs(port) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/play/motocross-gp/ws`);
    const queue = [];
    const waiters = [];
    ws.addEventListener('message', event => {
      const msg = JSON.parse(String(event.data));
      if (waiters.length) waiters.shift()(msg);
      else queue.push(msg);
    });
    ws.addEventListener('open', () => {
      resolve({
        send: obj => ws.send(JSON.stringify(obj)),
        next: () => queue.length
          ? Promise.resolve(queue.shift())
          : new Promise((r, rej) => {
              const t = setTimeout(() => rej(new Error('Timed out waiting for message')), 3000);
              waiters.push(m => { clearTimeout(t); r(m); });
            }),
        close: () => ws.close(),
      });
    });
    ws.addEventListener('error', () => reject(new Error('WebSocket connection failed')));
  });
}

test('motocross WebSocket relay pairs players, starts race, and relays poses', async () => {
  const relay = await startRelay({ port: 0 });
  const c1 = await connectWs(relay.port);
  const c2 = await connectWs(relay.port);

  try {
    c1.send({ type: 'join', room: 'AUTO', name: 'Tatenda' });
    const j1 = await c1.next();
    assert.equal(j1.type, 'joined');
    assert.equal(j1.slot, 0);

    c2.send({ type: 'join', room: 'AUTO', name: 'Guest' });
    const j2 = await c2.next();
    assert.equal(j2.type, 'joined');
    assert.equal(j2.room, j1.room);
    assert.equal(j2.slot, 1);

    const roomUpdate = await c1.next();
    assert.equal(roomUpdate.type, 'room');
    assert.equal(roomUpdate.players.length, 2);

    c1.send({ type: 'start', trackIndex: 1 });
    assert.equal((await c1.next()).type, 'start');
    assert.equal((await c2.next()).type, 'start');

    c1.send({ type: 'pose', x: 12.5, y: 3.1, a: 0.2, fx: 13.4, fy: 2.5, rx: 11.6, ry: 2.5, boost: true, fin: false });
    const pose = await c2.next();
    assert.equal(pose.type, 'pose');
    assert.equal(pose.slot, 0);
    assert.equal(pose.x, 12.5);
    assert.equal(pose.boost, true);
  } finally {
    c1.close();
    c2.close();
    await new Promise(r => relay.server.close(r));
  }
});
