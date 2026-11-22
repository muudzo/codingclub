import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Node canonicalises module URLs, but argv keeps symlinks such as /opt/.../current.
export function isEntryPoint(moduleUrl) {
  if (!process.argv[1]) return false;
  try { return fileURLToPath(moduleUrl) === realpathSync(process.argv[1]); }
  catch { return false; }
}
