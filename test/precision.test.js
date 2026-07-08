import { test } from 'node:test';
import { strictEqual, ok } from 'node:assert';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(HERE, '..', 'scripts', 'precision-study.mjs');

function run() {
  return new Promise((resolve, reject) => {
    execFile(process.execPath, [SCRIPT, '--json'], { maxBuffer: 1 << 20 }, (err, stdout) => {
      if (err) reject(err); else resolve(JSON.parse(stdout));
    });
  });
}

test('precision study runs over the corpus and returns aggregates', async () => {
  const r = await run();
  ok(r.cases.length >= 6);
  ok(typeof r.aggregate.reachRecallAvg === 'number');
});

test('reachability sees all impacted nodes (recall 1) on the signature-change case', async () => {
  const r = await run();
  const sig = r.cases.find((c) => c.change === 'signature');
  strictEqual(sig.reachRecall, 1);
  strictEqual(sig.warned, true); // WARN/BLOCK
});

test('the adversarial signature-preserving case is MISSED by the body-only verdict (the de-risk finding)', async () => {
  const r = await run();
  const adv = r.cases.find((c) => c.name.includes('signature-preserving'));
  strictEqual(adv.reachRecall, 1); // reachability SEES the consumer
  strictEqual(adv.warned, false); // but body-only verdict says PASS
  ok(r.aggregate.warningMissed.some((n) => n.includes('signature-preserving')));
  // this is quantitative evidence for RISKS.md #1: reachability != breakage
});
