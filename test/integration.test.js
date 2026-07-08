import { test } from 'node:test';
import { strictEqual, ok } from 'node:assert';
import { buildGraph } from '../lib/extract.js';
import { blastRadius, cascade } from '../lib/graph.js';
import { gate, CHANGE } from '../lib/gate.js';
import { refine } from '../lib/refine.js';
import { prImpact } from '../lib/pr.js';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const SAMPLE = join(HERE, 'fixtures', 'sample');

// End-to-end: the skill's actual pipeline is build-graph -> impact -> verdict (not a financial
// data pipeline; this covers the real flow the project exists to serve).

test('e2e: build sample -> impact -> verdict on a signature change', async () => {
  const { tier } = await buildGraph(SAMPLE);
  strictEqual(tier, 2);
  const { graph } = await buildGraph(SAMPLE);
  const seed = 'src/auth.js::validateToken';
  const blast = blastRadius(graph, seed, { depth: 5 });
  const casc = cascade(graph, seed, { depth: 5 });
  ok(blast.size >= 1, 'validateToken has dependents');
  const res = gate({ blast, cascade: casc, change: CHANGE.SIGNATURE, blastEdges: [] });
  ok(['WARN', 'BLOCK'].includes(res.verdict), 'signature change escalates');
});

test('e2e: refine ranks the dependents of a changed symbol', async () => {
  const { graph } = await buildGraph(SAMPLE);
  const seed = 'src/auth.js::validateToken';
  const blast = blastRadius(graph, seed);
  const r = refine(blast, new Map(), CHANGE.SIGNATURE, []);
  ok(r.nodes.length >= 1);
});

test('e2e: prImpact flags the consumer from a synthetic diff', async () => {
  const { graph } = await buildGraph(SAMPLE);
  const diff = `diff --git a/src/auth.js b/src/auth.js
--- a/src/auth.js
+++ b/src/auth.js
@@ -1,2 +1,2 @@
-export function validateToken(token) {
-  if (!token) return false;
+export function validateToken(token) {
+  return token.length > 10;
 }
`;
  const r = prImpact(graph, diff);
  ok(r.changedSymbols.includes('src/auth.js::validateToken'));
  ok(r.couldBreak.length >= 1);
});
