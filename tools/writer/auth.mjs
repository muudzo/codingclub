import { randomBytes, scrypt, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { mkdir, readFile, writeFile, readdir, rm, rename } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { PublishError } from '../composer/publish.mjs';

const derive = promisify(scrypt);
const scryptOptions = { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 };
const duration = 7 * 24 * 60 * 60 * 1000;
const validHex = (value, length) => typeof value === 'string' && new RegExp(`^[a-f0-9]{${length}}$`).test(value);
export const equalSecret = (a, b) => typeof a === 'string' && typeof b === 'string' && Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export async function writePasswordFile(path, password, { replace = false } = {}) {
  if (typeof password !== 'string' || password.length < 14 || password.length > 256 || /[\r\n\0]/.test(password)) throw new Error('Choose a publishing password of 14–256 characters.');
  const salt = randomBytes(32).toString('hex');
  const hash = (await derive(password, salt, 64, scryptOptions)).toString('hex');
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const content = JSON.stringify({ version: 1, salt, hash });
  if (!replace) await writeFile(path, content, { flag: 'wx', mode: 0o600 });
  else {
    const temporary = `${path}.${randomBytes(8).toString('hex')}`;
    await writeFile(temporary, content, { flag: 'wx', mode: 0o600 });
    await rename(temporary, path);
  }
}

export async function createAuth({ passwordFile, stateRoot, secure = true, now = () => Date.now() }) {
  const credentials = JSON.parse(await readFile(passwordFile, 'utf8'));
  if (credentials.version !== 1 || !validHex(credentials.salt, 64) || !validHex(credentials.hash, 128)) throw new Error('The owner password file is invalid.');
  const sessions = join(stateRoot, 'sessions');
  await mkdir(sessions, { recursive: true, mode: 0o700 });
  const cookieName = secure ? '__Host-tatenda_writer' : 'writer_test_session';
  const cookie = (token, age = duration / 1000) => `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${secure ? '; Secure' : ''}`;
  const sessionFile = token => join(sessions, `${createHash('sha256').update(token).digest('hex')}.json`);
  const tokenFrom = header => {
    const values = (header || '').split(';').map(value => value.trim()).filter(value => value.startsWith(`${cookieName}=`));
    if (values.length !== 1) return;
    const token = values[0].slice(cookieName.length + 1);
    return validHex(token, 64) ? token : undefined;
  };
  const attempts = new Map();
  let globalAttempts = [], checking = false;
  return {
    async login(password, client) {
      const cutoff = now() - 15 * 60 * 1000;
      globalAttempts = globalAttempts.filter(time => time > cutoff);
      for (const [key, times] of attempts) {
        const recent = times.filter(time => time > cutoff);
        if (recent.length) attempts.set(key, recent); else attempts.delete(key);
      }
      const recent = attempts.get(client) || [];
      if (checking || recent.length >= 5 || globalAttempts.length >= 30) {
        const error = new PublishError('Too many sign-in attempts. Please try again later.', 429);
        error.retryAfter = checking ? 5 : 900;
        throw error;
      }
      attempts.set(client, [...recent, now()]); globalAttempts.push(now());
      if (typeof password !== 'string' || password.length > 256) return null;
      checking = true;
      try {
        const actual = await derive(password, credentials.salt, 64, scryptOptions);
        if (!timingSafeEqual(actual, Buffer.from(credentials.hash, 'hex'))) return null;
        attempts.delete(client);
        for (const name of await readdir(sessions)) {
          if (!/^[a-f0-9]{64}\.json$/.test(name)) continue;
          const path = join(sessions, name);
          const record = JSON.parse(await readFile(path, 'utf8'));
          if (record.expires <= now() || record.passwordVersion !== credentials.salt) await rm(path, { force: true });
        }
        const token = randomBytes(32).toString('hex');
        await writeFile(sessionFile(token), JSON.stringify({ csrf: randomBytes(32).toString('hex'), expires: now() + duration, passwordVersion: credentials.salt }), { flag: 'wx', mode: 0o600 });
        return cookie(token);
      } finally { checking = false; }
    },
    async session(header) {
      const token = tokenFrom(header);
      if (!token) return null;
      try {
        const data = JSON.parse(await readFile(sessionFile(token), 'utf8'));
        if (data.expires <= now() || data.passwordVersion !== credentials.salt || !validHex(data.csrf, 64)) {
          await rm(sessionFile(token), { force: true }); return null;
        }
        return { csrf: data.csrf };
      } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
    },
    async logout(header) {
      const token = tokenFrom(header);
      if (token) await rm(sessionFile(token), { force: true });
      return cookie('', 0);
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let bytes = 0, password = '';
  for await (const chunk of process.stdin) {
    bytes += chunk.length;
    if (bytes > 1024) throw new Error('Publishing password is too long.');
    password += chunk.toString();
  }
  await writePasswordFile(process.argv[2], password, { replace: process.argv.includes('--replace') });
  console.log('Publishing password saved securely.');
}
