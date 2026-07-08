import { test } from 'node:test';
import { strictEqual, ok } from 'node:assert';
import { refine } from '../lib/refine.js';
import { CHANGE } from '../lib/gate.js';

const blast = new Map([['api.js', 1], ['index.js', 2], ['utils.js', 3]]);
const edges = (tier = 2) => [
  { from: 'api.js', to: 'seed', type: 'calls', tier, inferred: false },
  { from: 'index.js', to: 'api.js', type: 'imports', tier, inferred: false },
  { from: 'utils.js', to: 'index.js', type: 'imports', tier, inferred: false },
];

test('signature change ranks direct dependents as likely, transitive as maybe', () => {
  const r = refine(blast, new Map(), CHANGE.SIGNATURE, edges(2));
  const api = r.nodes.find((n) => n.node === 'api.js');
  strictEqual(api.risk, 'likely');
  const idx = r.nodes.find((n) => n.node === 'index.js');
  ok(idx.risk === 'maybe');
});

test('body-only change discounts all dependents to unlikely', () => {
  const r = refine(blast, new Map(), CHANGE.BODY, edges(2));
  for (const n of r.nodes) strictEqual(n.risk, 'unlikely');
});

test('rename marks everything maybe (over-reports)', () => {
  const r = refine(blast, new Map(), CHANGE.RENAME, edges(2));
  for (const n of r.nodes) strictEqual(n.risk, 'maybe');
});

test('delete ranks direct dependents likely', () => {
  const r = refine(blast, new Map(), CHANGE.DELETE, edges(2));
  const api = r.nodes.find((n) => n.node === 'api.js');
  strictEqual(api.risk, 'likely');
});

test('inferred (tier-3) edges lower node confidence', () => {
  const r = refine(blast, new Map(), CHANGE.SIGNATURE, edges(3).map((e) => ({ ...e, inferred: true })));
  for (const n of r.nodes) strictEqual(n.confidence, 'low');
});

test('most-risky nodes come first', () => {
  const r = refine(blast, new Map(), CHANGE.SIGNATURE, edges(2));
  // 'likely' (api.js, depth 1) before 'maybe' (index.js, depth 2)
  ok(rank(r.nodes[0].risk) <= rank(r.nodes[1].risk));
});
function rank(r) { return { likely: 0, maybe: 1, unlikely: 2, none: 3 }[r] ?? 2; }
