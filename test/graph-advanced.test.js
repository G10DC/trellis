import { test } from 'node:test';
import { strictEqual, ok } from 'node:assert';
import { createGraph, addNode, addEdge, scc, reachabilityBounded, reachability, memoizedReachability } from '../lib/graph.js';

// A → B → C → A (cycle), plus A → D (out of cycle)
function cyclic() {
  const g = createGraph();
  for (const id of ['A', 'B', 'C', 'D']) addNode(g, { id, kind: 'symbol', file: id, line: 1, exported: false });
  addEdge(g, { from: 'A', to: 'B', type: 'calls', tier: 2, inferred: false });
  addEdge(g, { from: 'B', to: 'C', type: 'calls', tier: 2, inferred: false });
  addEdge(g, { from: 'C', to: 'A', type: 'calls', tier: 2, inferred: false });
  addEdge(g, { from: 'A', to: 'D', type: 'calls', tier: 2, inferred: false });
  return g;
}

test('scc collapses a 3-node cycle into one component', () => {
  const { components } = scc(cyclic());
  const sizes = components.map((c) => c.length).sort((a, b) => b - a);
  strictEqual(sizes[0], 3); // A,B,C in one SCC
  ok(components.some((c) => c.length === 1 && c[0] === 'D'));
});

test('reachabilityBounded reports truncation when depth cuts the closure', () => {
  const g = cyclic();
  const r = reachabilityBounded(g, 'A', { depth: 1, reverse: false });
  ok(r.reached.has('B'));
  ok(r.truncated); // C and D are beyond depth 1 but reachable
});

test('reachabilityBounded reports no truncation when depth is enough', () => {
  const g = cyclic();
  const r = reachabilityBounded(g, 'A', { depth: 10, reverse: false });
  strictEqual(r.truncated, false);
});

test('memoizedReachability caches and returns identical results', () => {
  const g = cyclic();
  const cache = new Map();
  const a = memoizedReachability(g, 'A', { depth: 5, reverse: false }, cache);
  const b = memoizedReachability(g, 'A', { depth: 5, reverse: false }, cache);
  strictEqual(a, b); // same object reference (cache hit)
  const fresh = reachability(g, 'A', { depth: 5, reverse: false });
  strictEqual(a.size, fresh.size);
});
