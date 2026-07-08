#!/usr/bin/env node
// scripts/precision-study.mjs — Phase 0 de-risking harness.
// Measures, on a controlled corpus of edits (incl. the adversarial cases), whether the
// reachability set + verdict actually matches real impact. Answers the load-bearing question
// of RISKS.md #1 with numbers, before investing in more infrastructure.
//
// Metrics per case:
//   reachRecall    = |blast ∩ impacted| / |impacted|     (does the graph SEE the impacted nodes?)
//   reachPrecision = |blast ∩ impacted| / |blast|        (how much noise?)
//   warned         = did the gate emit WARN/BLOCK?       (triage signal)
//   warningCorrect = warned === shouldWarn
//
// The adversarial case (signature-preserving semantic change) is expected to show the limit:
// reachability sees the consumer but the body-only verdict says PASS -> warningMissed.

import { readdir, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildGraph } from '../lib/extract.js';
import { blastRadius } from '../lib/graph.js';
import { gate, CHANGE } from '../lib/gate.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const CORPUS = join(HERE, '..', 'test', 'fixtures', 'corpus');

function intersect(a, b) {
  const s = new Set(b);
  return [...a].filter((x) => s.has(x));
}

async function evalCase(file) {
  const c = JSON.parse(await readFile(join(CORPUS, file), 'utf8'));
  const files = Object.keys(c.files);
  const { graph } = await buildGraph('CORPUS', {
    listFiles: async () => files,
    readFile: async (f) => c.files[f],
  });
  const seed = c.edit.node;
  const blast = blastRadius(graph, seed, { depth: 5 });
  const blastNodes = [...blast.keys()];
  const impacted = c.impacted || [];
  const seen = intersect(blastNodes, impacted);
  const reachRecall = impacted.length ? seen.length / impacted.length : 1;
  const reachPrecision = blastNodes.length ? seen.length / blastNodes.length : 1;
  const res = gate({ blast, cascade: new Map(), change: c.edit.change, blastEdges: [] });
  const warned = res.verdict === 'WARN' || res.verdict === 'BLOCK';
  return {
    name: c.name,
    change: c.edit.change,
    blastSize: blastNodes.length,
    impacted: impacted.length,
    reachRecall: Math.round(reachRecall * 100) / 100,
    reachPrecision: Math.round(reachPrecision * 100) / 100,
    verdict: res.verdict,
    warned,
    shouldWarn: !!c.shouldWarn,
    warningCorrect: warned === !!c.shouldWarn,
  };
}

async function main() {
  const files = (await readdir(CORPUS)).filter((f) => f.endsWith('.json')).sort();
  const cases = [];
  for (const f of files) cases.push(await evalCase(f));

  const reachRecallAvg = avg(cases.map((c) => c.reachRecall));
  const reachPrecAvg = avg(cases.map((c) => c.reachPrecision));
  const warningCorrectCount = cases.filter((c) => c.warningCorrect).length;
  const warningMissed = cases.filter((c) => c.shouldWarn && !c.warned); // false negatives
  const falseAlarms = cases.filter((c) => !c.shouldWarn && c.warned); // false positives

  const report = {
    cases,
    aggregate: {
      reachRecallAvg: Math.round(reachRecallAvg * 100) / 100,
      reachPrecisionAvg: Math.round(reachPrecAvg * 100) / 100,
      warningCorrect: `${warningCorrectCount}/${cases.length}`,
      warningMissed: warningMissed.map((c) => c.name),
      falseAlarms: falseAlarms.map((c) => c.name),
    },
  };
  console.log(JSON.stringify(report, null, 2));
  return report;
}

function avg(xs) { return xs.reduce((a, b) => a + b, 0) / (xs.length || 1); }

const arg = process.argv[2];
if (arg === '--json') {
  main().then((r) => process.exit(0));
} else {
  main().then((r) => {
    console.error('\n=== Phase 0 precision study ===');
    console.error(`Reach recall avg:    ${r.aggregate.reachRecallAvg}`);
    console.error(`Reach precision avg: ${r.aggregate.reachPrecisionAvg}`);
    console.error(`Warning correct:     ${r.aggregate.warningCorrect}`);
    console.error(`Warnings MISSED (false negatives): ${r.aggregate.warningMissed.length}`);
    r.aggregate.warningMissed.forEach((n) => console.error(`  - ${n}`));
    console.error(`False alarms:        ${r.aggregate.falseAlarms.length}`);
  });
}
