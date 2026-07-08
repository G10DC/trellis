import { test } from 'node:test';
import { strictEqual, ok } from 'node:assert';
import { execFile, isWithin } from '../lib/security.js';

test('execFile runs a command with argument arrays (no shell)', async () => {
  const out = await execFile(process.execPath, ['-e', 'console.log("ok")']);
  strictEqual(out.trim(), 'ok');
});

test('execFile rejects on non-zero exit', async () => {
  await execFile(process.execPath, ['--bad-flag']).then(
    () => { throw new Error('should have rejected'); },
    (e) => { ok(/exited|bad-flag/.test(e.message)); }
  );
});

test('isWithin allows inside, blocks traversal', () => {
  strictEqual(isWithin('/root', '/root/src/a.js'), true);
  strictEqual(isWithin('/root', '/root'), true);
  strictEqual(isWithin('/root', '/etc/passwd'), false);
  strictEqual(isWithin('/root', '/root/../etc/passwd'), false);
});
