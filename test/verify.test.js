import { test } from 'node:test';
import { strictEqual, ok } from 'node:assert';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const VERIFY = join(HERE, '..', 'scripts', 'verify.mjs');
const SAMPLE = join(HERE, '..', 'test', 'fixtures', 'sample');

function run(args = []) {
  return new Promise((resolve, reject) => {
    execFile(process.execPath, [VERIFY, ...args], { maxBuffer: 1 << 20 }, (err, stdout, stderr) => {
      resolve({ code: err ? err.code : 0, stdout, stderr });
    });
  });
}

test('verify reports integrity on a clean fixture', async () => {
  const r = await run([SAMPLE]);
  strictEqual(r.code, 0);
  ok(/dangling/i.test(r.stdout));
});

test('verify --rebuild rebuilds and still reports clean', async () => {
  const r = await run([SAMPLE, '--rebuild']);
  strictEqual(r.code, 0);
  ok(/dangling.*0|ok/i.test(r.stdout));
});
