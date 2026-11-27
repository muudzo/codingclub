import { randomUUID } from 'node:crypto';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { validateSketchPayload } from '../../src/lib/sketches.mjs';
import { PublishError } from '../composer/publish.mjs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function createSketchStore({ stateRoot, maxPending = 50, maxPerHour = 5, now = () => Date.now() }) {
  const pendingDir = join(stateRoot, 'sketches', 'pending');
  const rateWindows = new Map();

  function checkRateLimit(ip) {
    const key = ip || 'unknown';
    const current = now();
    const cutoff = current - 3600_000;
    const recent = (rateWindows.get(key) || []).filter(ts => ts > cutoff);
    if (recent.length >= maxPerHour) {
      const oldest = recent[0];
      const retryAfter = Math.max(1, Math.ceil((oldest + 3600_000 - current) / 1000));
      const err = new PublishError('Too many sketches sent from this connection. Please try again later.', 429);
      err.retryAfter = String(retryAfter);
      throw err;
    }
    recent.push(current);
    rateWindows.set(key, recent);
  }

  async function listFiles() {
    try {
      const entries = await readdir(pendingDir, { withFileTypes: true });
      return entries.filter(e => e.isFile() && e.name.endsWith('.json')).map(e => e.name);
    } catch (error) {
      if (error.code === 'ENOENT') return [];
      throw error;
    }
  }

  return {
    async submit(rawInput, clientIp) {
      const checked = validateSketchPayload(rawInput);
      if (!checked.ok) throw new PublishError(checked.error, 400);
      checkRateLimit(clientIp);
      await mkdir(pendingDir, { recursive: true, mode: 0o700 });
      const existing = await listFiles();
      if (existing.length >= maxPending) {
        throw new PublishError('The sketch review queue is currently full. Please try again later.', 503);
      }
      const id = randomUUID();
      const record = {
        id,
        ...checked.data,
        createdAt: new Date(now()).toISOString(),
      };
      await writeFile(join(pendingDir, `${id}.json`), JSON.stringify(record), { flag: 'wx', mode: 0o600 });
      return record;
    },

    async listPending() {
      const files = await listFiles();
      const items = [];
      for (const file of files) {
        try {
          const parsed = JSON.parse(await readFile(join(pendingDir, file), 'utf8'));
          if (parsed && UUID_RE.test(parsed.id || '')) items.push(parsed);
        } catch { /* ignore unreadable queue entry */ }
      }
      items.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
      return items;
    },

    async takePending(id) {
      if (typeof id !== 'string' || !UUID_RE.test(id)) throw new PublishError('Invalid sketch ID.', 400);
      try {
        return JSON.parse(await readFile(join(pendingDir, `${id}.json`), 'utf8'));
      } catch (error) {
        if (error.code === 'ENOENT') throw new PublishError('Sketch not found in queue.', 404);
        throw error;
      }
    },

    async removePending(id) {
      if (typeof id !== 'string' || !UUID_RE.test(id)) throw new PublishError('Invalid sketch ID.', 400);
      await rm(join(pendingDir, `${id}.json`), { force: true });
    },
  };
}
