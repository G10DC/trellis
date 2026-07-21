import { test } from 'node:test';
import { strictEqual, ok } from 'node:assert';
import { createGraph, addNode, blastRadius } from '../lib/graph.js';
import { applyLLMEdges } from '../lib/model-edges.js';

test('applyLLMEdges accepts well-formed edges with evidence (tier 3, inferred true)', () => {
  const g = createGraph();
  addNode(g, { id: 'a.js::handler', kind: 'symbol', file: 'a.js', line: 1, exported: false, labels: [] });
  addNode(g, { id: 'events::UserLogin', kind: 'symbol', file: 'events.js', line: 1, exported: false, labels: [] });
  const r = applyLLMEdges(g, [
    { from: 'a.js::handler', to: 'events::UserLogin', type: 'registered', evidence: 'eventBus.on @ events.js:12' },
  ]);
  strictEqual(r.accepted, 1);
  strictEqual(r.rejected, 0);
  const e = g.edges[0];
  strictEqual(e.tier, 3);
  strictEqual(e.inferred, true);
  ok(blastRadius(g, 'events::UserLogin').has('a.js::handler'));
});

test('applyLLMEdges rejects edges without evidence', () => {
  const g = createGraph();
  const r = applyLLMEdges(g, [{ from: 'a', to: 'b', type: 'calls' }]);
  strictEqual(r.accepted, 0);
  strictEqual(r.rejected, 1);
  ok(r.reasons[0].includes('no evidence'));
});

test('applyLLMEdges rejects edges missing required fields', () => {
  const g = createGraph();
  const r = applyLLMEdges(g, [{ from: 'a', type: 'calls', evidence: 'x' }]);
  strictEqual(r.rejected, 1);
  ok(r.reasons[0].includes('missing'));
});

test('applyLLMEdges creates missing nodes (implicit wiring) with inferred label', () => {
  const g = createGraph();
  addNode(g, { id: 'a.js::handler', kind: 'symbol', file: 'a.js', line: 1, exported: false, labels: [] });
  applyLLMEdges(g, [{ from: 'a.js::handler', to: 'di::Logger', type: 'instantiates', evidence: 'inject @ di.js:5' }]);
  ok(g.nodes.has('di::Logger'));
  ok(g.nodes.get('di::Logger').labels.includes('inferred'));
});

test('applyLLMEdges is non-fatal on non-array input', () => {
  const g = createGraph();
  const r = applyLLMEdges(g, { not: 'array' });
  strictEqual(r.accepted, 0);
  ok(r.reasons[0].includes('not an array'));
});
