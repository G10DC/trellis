import { test } from 'node:test';
import { strictEqual, ok } from 'node:assert';
import { gate, classifyChange, CHANGE } from '../lib/gate.js';

const map = (n) => new Map(Array.from({ length: n }, (_, i) => [`node${i}`, i + 1]));
const edges = (tier, inferred = false, n = 3) => Array.from({ length: n }, () => ({ type: 'imports', tier, inferred }));

test('classifyChange picks rename over signature over body', () => {
  strictEqual(classifyChange({ nameChanged: true }), CHANGE.RENAME);
  strictEqual(classifyChange({ touchedDeclaration: true }), CHANGE.SIGNATURE);
  strictEqual(classifyChange({}), CHANGE.BODY);
  strictEqual(classifyChange({ kind: 'add' }), CHANGE.ADD);
  strictEqual(classifyChange({ kind: 'delete' }), CHANGE.DELETE);
});

test('empty blast -> PASS, with an honesty caveat about tier-0', () => {
  const r = gate({ blast: map(0), cascade: map(0), change: CHANGE.BODY, blastEdges: edges(0, false, 0) });
  strictEqual(r.verdict, 'PASS');
  ok(r.reasons.some((x) => /tier-0\/1 only/.test(x)));
});

test('body-only with few dependents -> PASS; many -> WARN', () => {
  strictEqual(gate({ blast: map(3), cascade: map(0), change: CHANGE.BODY, blastEdges: edges(0) }).verdict, 'PASS');
  strictEqual(gate({ blast: map(5), cascade: map(0), change: CHANGE.BODY, blastEdges: edges(0) }).verdict, 'WARN');
});

test('signature change escalates: few -> WARN, many -> BLOCK', () => {
  strictEqual(gate({ blast: map(2), cascade: map(0), change: CHANGE.SIGNATURE, blastEdges: edges(0) }).verdict, 'WARN');
  strictEqual(gate({ blast: map(5), cascade: map(0), change: CHANGE.SIGNATURE, blastEdges: edges(0) }).verdict, 'BLOCK');
});

test('rename is always WARN (over-reports)', () => {
  const r = gate({ blast: map(10), cascade: map(0), change: CHANGE.RENAME, blastEdges: edges(0) });
  strictEqual(r.verdict, 'WARN');
  ok(r.reasons.some((x) => /OVER-reports/.test(x)));
});

test('delete with dependents -> BLOCK', () => {
  strictEqual(gate({ blast: map(4), cascade: map(0), change: CHANGE.DELETE, blastEdges: edges(0) }).verdict, 'BLOCK');
});

test('additive change -> PASS regardless of blast', () => {
  strictEqual(gate({ blast: map(9), cascade: map(0), change: CHANGE.ADD, blastEdges: edges(0) }).verdict, 'PASS');
});

test('inferred (tier-3) edges lower the confidence', () => {
  const r = gate({ blast: map(3), cascade: map(0), change: CHANGE.SIGNATURE, blastEdges: edges(3, true) });
  strictEqual(r.confidence, 'low');
});

test('every verdict carries the honest caveat', () => {
  const r = gate({ blast: map(2), cascade: map(0), change: CHANGE.SIGNATURE, blastEdges: edges(0) });
  ok(/CANDIDATE set, not a proven breakage set/.test(r.honest));
});

test('top dependents are sorted nearest-first', () => {
  const blast = new Map([['far', 4], ['near', 1], ['mid', 2]]);
  const r = gate({ blast, cascade: map(0), change: CHANGE.SIGNATURE, blastEdges: edges(0) });
  strictEqual(r.top[0].node, 'near');
  strictEqual(r.top[r.top.length - 1].node, 'far');
});

// A seed the graph never indexed traverses nothing and returns an empty blast radius —
// byte-for-byte the answer given for a node that IS indexed and genuinely has no
// dependents. The first means "not looked at"; the second means "safe to change".
// Reporting PASS for both is this gate answering a question it was never asked.
test('a seed absent from the graph is not a low-risk verdict', async () => {
  const { createGraph, addNode, addEdge, blastRadius } = await import('../lib/graph.js');

  const g = createGraph();
  addNode(g, { id: 'a' });
  addNode(g, { id: 'b' });
  addEdge(g, { from: 'a', to: 'b', type: 'imports' });

  const indexedWithNoDependents = blastRadius(g, 'a');
  strictEqual(indexedWithNoDependents.size, 0);
  strictEqual(indexedWithNoDependents.seedKnown, true);
  strictEqual(gate({ blast: indexedWithNoDependents, cascade: new Map(), change: CHANGE.SIGNATURE }).verdict, 'PASS');

  const neverIndexed = blastRadius(g, 'not-in-the-graph.mjs');
  strictEqual(neverIndexed.size, 0);
  strictEqual(neverIndexed.seedKnown, false);

  const verdict = gate({ blast: neverIndexed, cascade: new Map(), change: CHANGE.SIGNATURE });
  strictEqual(verdict.verdict, 'WARN');
  strictEqual(verdict.confidence, 'none');
  ok(/NOT in the graph/.test(verdict.reasons[0]), verdict.reasons[0]);
  ok(verdict.summary, 'the early return must keep the shape callers destructure');
  ok(verdict.honest, 'the early return must keep the shape callers destructure');
});

// The flag has to survive the shape the value is actually used as.
test('marking the seed does not stop the result being a Set', async () => {
  const { createGraph, addNode, blastRadius, cascade } = await import('../lib/graph.js');
  const g = createGraph();
  addNode(g, { id: 'a' });

  const r = blastRadius(g, 'a');
  ok(r instanceof Map || r instanceof Set, 'still the collection callers iterate');
  strictEqual([...r].length, 0);
  strictEqual(cascade(g, 'nope').seedKnown, false);
});
