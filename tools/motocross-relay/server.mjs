import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const WS_MAGIC = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const ROOM_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function makeRoomCode(existing) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    let code = '';
    for (let i = 0; i < 4; i += 1) code += ROOM_CHARS[Math.floor(Math.random() * ROOM_CHARS.length)];
    if (!existing.has(code)) return code;
  }
  return null;
}

function encodeFrame(text) {
  const payload = Buffer.from(text, 'utf8');
  const len = payload.length;
  if (len < 126) return Buffer.concat([Buffer.from([0x81, len]), payload]);
  if (len < 65536) {
    const hdr = Buffer.alloc(4);
    hdr[0] = 0x81;
    hdr[1] = 126;
    hdr.writeUInt16BE(len, 2);
    return Buffer.concat([hdr, payload]);
  }
  throw new Error('Frame too large');
}

function parseFrames(buffer, maxMsgBytes) {
  const frames = [];
  let offset = 0;
  while (offset + 2 <= buffer.length) {
    const b0 = buffer[offset];
    const b1 = buffer[offset + 1];
    const opcode = b0 & 0x0f;
    const masked = (b1 & 0x80) !== 0;
    let len = b1 & 0x7f;
    let pos = offset + 2;
    if (len === 126) {
      if (pos + 2 > buffer.length) break;
      len = buffer.readUInt16BE(pos);
      pos += 2;
    } else if (len === 127) {
      return { error: 'Oversized frame' };
    }
    if (len > maxMsgBytes) return { error: 'Message too large' };
    const maskBytes = masked ? 4 : 0;
    if (pos + maskBytes + len > buffer.length) break;
    const mask = masked ? buffer.subarray(pos, pos + 4) : null;
    pos += maskBytes;
    const data = Buffer.allocUnsafe(len);
    for (let i = 0; i < len; i += 1) {
      data[i] = masked ? buffer[pos + i] ^ mask[i % 4] : buffer[pos + i];
    }
    frames.push({ opcode, data });
    offset = pos + len;
  }
  return { frames, rest: buffer.subarray(offset) };
}

export async function startRelay({ port = 3211, host = '127.0.0.1', maxRooms = 30, maxPlayers = 4, maxMsgBytes = 1024, maxPerSec = 30 } = {}) {
  const rooms = new Map();
  const server = createServer((req, res) => {
    if (req.url === '/play/motocross-gp/ws/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, rooms: rooms.size }));
      return;
    }
    res.writeHead(426, { 'Content-Type': 'text/plain' });
    res.end('WebSocket upgrade required');
  });

  function send(client, obj) {
    if (client.socket.destroyed) return;
    try { client.socket.write(encodeFrame(JSON.stringify(obj))); } catch { /* ignore closed */ }
  }

  function broadcastRoom(room, obj, except = null) {
    for (const member of room.clients) {
      if (member !== except) send(member, obj);
    }
  }

  function leaveCurrent(client) {
    if (!client.room) return;
    const room = rooms.get(client.room);
    client.room = null;
    if (!room) return;
    room.clients = room.clients.filter(c => c !== client);
    if (!room.clients.length) {
      rooms.delete(room.code);
      return;
    }
    broadcastRoom(room, {
      type: 'room',
      room: room.code,
      trackIndex: room.trackIndex,
      players: room.clients.map(c => ({ slot: c.slot, name: c.name })),
    });
  }

  server.on('upgrade', (req, socket) => {
    const path = (req.url || '').split('?')[0];
    if (path !== '/play/motocross-gp/ws') {
      socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
      socket.destroy();
      return;
    }
    const key = req.headers['sec-websocket-key'];
    if (typeof key !== 'string' || !key) {
      socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
      socket.destroy();
      return;
    }
    const accept = createHash('sha1').update(key + WS_MAGIC).digest('base64');
    socket.write([
      'HTTP/1.1 101 Switching Protocols',
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Accept: ${accept}`,
      '',
      '',
    ].join('\r\n'));

    const client = { socket, room: null, slot: 0, name: 'Racer', msgCount: 0, windowStart: Date.now() };
    let buf = Buffer.alloc(0);

    socket.on('data', chunk => {
      buf = Buffer.concat([buf, chunk]);
      if (buf.length > maxMsgBytes * 4) {
        socket.destroy();
        return;
      }
      const parsed = parseFrames(buf, maxMsgBytes);
      if (parsed.error) {
        socket.destroy();
        return;
      }
      buf = parsed.rest;
      for (const frame of parsed.frames) {
        if (frame.opcode === 0x8) { socket.end(); return; }
        if (frame.opcode === 0x9) {
          try { socket.write(Buffer.concat([Buffer.from([0x8a, frame.data.length]), frame.data])); } catch {}
          continue;
        }
        if (frame.opcode !== 0x1) continue;
        const now = Date.now();
        if (now - client.windowStart > 1000) { client.windowStart = now; client.msgCount = 0; }
        client.msgCount += 1;
        if (client.msgCount > maxPerSec) continue;

        let msg;
        try { msg = JSON.parse(frame.data.toString('utf8')); } catch { continue; }
        if (!msg || typeof msg !== 'object') continue;

        if (msg.type === 'join') {
          leaveCurrent(client);
          const rawCode = typeof msg.room === 'string' ? msg.room.trim().toUpperCase() : 'AUTO';
          let room = null;
          if (rawCode === 'AUTO' || !rawCode) {
            for (const candidate of rooms.values()) {
              if (!candidate.started && candidate.clients.length < maxPlayers) { room = candidate; break; }
            }
            if (!room) {
              if (rooms.size >= maxRooms) { send(client, { type: 'error', error: 'Rooms are full. Try again shortly.' }); continue; }
              const code = makeRoomCode(rooms);
              if (!code) { send(client, { type: 'error', error: 'Could not allocate room.' }); continue; }
              room = { code, trackIndex: 0, started: false, clients: [] };
              rooms.set(code, room);
            }
          } else if (/^[A-Z0-9]{4}$/.test(rawCode)) {
            room = rooms.get(rawCode);
            if (!room) {
              if (rooms.size >= maxRooms) { send(client, { type: 'error', error: 'Rooms are full. Try again shortly.' }); continue; }
              room = { code: rawCode, trackIndex: 0, started: false, clients: [] };
              rooms.set(rawCode, room);
            } else if (room.clients.length >= maxPlayers) {
              send(client, { type: 'error', error: `Room ${rawCode} is full.` });
              continue;
            }
          } else {
            send(client, { type: 'error', error: 'Use a 4-character room code.' });
            continue;
          }
          const used = new Set(room.clients.map(c => c.slot));
          let slot = 0;
          while (used.has(slot)) slot += 1;
          client.room = room.code;
          client.slot = slot;
          client.name = typeof msg.name === 'string' && msg.name.trim() ? msg.name.trim().slice(0, 14) : `P${slot + 1}`;
          room.clients.push(client);
          const players = room.clients.map(c => ({ slot: c.slot, name: c.name }));
          send(client, { type: 'joined', room: room.code, slot, trackIndex: room.trackIndex, players });
          broadcastRoom(room, { type: 'room', room: room.code, trackIndex: room.trackIndex, players }, client);
        } else if (msg.type === 'start' && client.room) {
          const room = rooms.get(client.room);
          if (!room) continue;
          const idx = Number.isInteger(msg.trackIndex) && msg.trackIndex >= 0 && msg.trackIndex < 10 ? msg.trackIndex : 0;
          room.trackIndex = idx;
          room.started = true;
          broadcastRoom(room, { type: 'start', trackIndex: idx });
        } else if (msg.type === 'pose' && client.room) {
          const room = rooms.get(client.room);
          if (!room) continue;
          const nums = [msg.x, msg.y, msg.a, msg.fx, msg.fy, msg.rx, msg.ry];
          if (!nums.every(n => typeof n === 'number' && Number.isFinite(n))) continue;
          broadcastRoom(room, {
            type: 'pose',
            slot: client.slot,
            x: msg.x, y: msg.y, a: msg.a,
            fx: msg.fx, fy: msg.fy, rx: msg.rx, ry: msg.ry,
            boost: Boolean(msg.boost),
            fin: Boolean(msg.fin),
          }, client);
        }
      }
    });

    socket.on('close', () => leaveCurrent(client));
    socket.on('error', () => leaveCurrent(client));
  });

  await new Promise(r => server.listen(port, host, r));
  return { server, port: server.address().port, rooms };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.MOTOCROSS_RELAY_PORT || 3211);
  await startRelay({ port });
  console.log(`Motocross relay listening on 127.0.0.1:${port}`);
}
