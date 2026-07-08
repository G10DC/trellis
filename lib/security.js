// lib/security.js — hardening helpers (Phase 4, but used by sync.js).
// - execFile: argument-array spawn, NEVER shell=True (no injection via paths/specs).
// - isWithin: path-traversal guard (keep operations inside the project root).

import { spawn } from 'node:child_process';
import { isAbsolute, relative, resolve } from 'node:path';

/** Run a command with argument arrays (never shell=True). Resolves stdout. Rejects on non-zero/timeout. */
export function execFile(cmd, args, { cwd, timeoutMs = 30000 } = {}) {
  return new Promise((resolveP, reject) => {
    const child = spawn(cmd, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    const t = setTimeout(() => { child.kill('SIGKILL'); reject(new Error(`timeout: ${cmd} ${args.join(' ')}`)); }, timeoutMs);
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('error', (e) => { clearTimeout(t); reject(e); });
    child.on('close', (code) => {
      clearTimeout(t);
      if (code === 0) resolveP(out);
      else reject(new Error(`${cmd} exited ${code}: ${err.slice(0, 300)}`));
    });
  });
}

/** True if `target` is inside `root` (prevents escapes via ../ or absolute paths). */
export function isWithin(root, target) {
  const rel = relative(resolve(root), resolve(root, target));
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}
