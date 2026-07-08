import { test } from 'node:test';
import { strictEqual, notStrictEqual, ok } from 'node:assert';
import {
  createGraph, addNode, addEdge, reachability, blastRadius, cascade,
  dangling, toJSONL, fromJSONL, adjacency, stats,
} from '../lib/graph.js';

function toy() {
  // a.js -> b.js -> c.js  (a imports b imports c); b defines foo
  const g = createGraph();
  for (const id of ['a.js', 'b.js', 'c.js', 'b.js::foo']) addNode(g, { id, kind: 'symbol', file: id, line: 1, exported: false });
  addEdge(g, { from: 'a.js', to: 'b.js', type: 'imports', tier: 0, inferred: false });
  addEdge(g, { from: 'b.js', to: 'c.js', type: 'imports', tier: 0, inferred: false });
  addEdge(g, { from: 'b.js', to: 'b.js::foo', type: 'defines', tier: 0, inferred: false });
  return g;
}

test('reachability forward = cascade (what b depends on)', () => {
  const g = toy();
  const r = reachability(g, 'b.js', { reverse: false });
  ok(r.has('c.js'));
  ok(r.has('b.js::foo'));
  strictEqual(r.has('a.js'), false);
});

test('reachability reverse = blast radius (who depends on c)', () => {
  const g = toy();
  const r = reachability(g, 'c.js', { reverse: true });
  ok(r.has('b.js'));
  ok(r.has('a.js'));
});

test('blastRadius excludes the seed; cascade excludes the seed', () => {
  const g = toy();
  strictEqual(blastRadius(g, 'c.js').has('c.js'), false);
  strictEqual(cascade(g, 'b.js').has('b.js'), false);
  strictEqual(blastRadius(g, 'c.js').size, 2); // a + b
});

test('depth cap is honored', () => {
  const g = toy();
  const r = reachability(g, 'c.js', { reverse: true, depth: 1 }); // only direct
  ok(r.has('b.js'));
  strictEqual(r.has('a.js'), false); // depth 2, capped out
});

test('edge-type filter excludes non-matching edges', () => {
  const g = toy();
  const r = reachability(g, 'b.js', { reverse: false, types: ['imports'] });
  ok(r.has('c.js'));
  strictEqual(r.has('b.js::foo'), false); // 'defines' filtered out
});

test('dangling flags edges to missing nodes', () => {
  const g = createGraph();
  addNode(g, { id: 'a.js', kind: 'file', file: 'a.js', line: 1, exported: false });
  addEdge(g, { from: 'a.js', to: 'ghost.js', type: 'imports', tier: 0, inferred: false });
  const d = dangling(g);
  strictEqual(d.length, 1);
  strictEqual(d[0].missing, 'to');
});

test('JSONL round-trip preserves nodes + edges', () => {
  const g = toy();
  const g2 = fromJSONL(toJSONL(g));
  strictEqual(g2.nodes.size, g.nodes.size);
  strictEqual(g2.edges.length, g.edges.length);
  notStrictEqual(blastRadius(g2, 'c.js').size, 0);
});

test('adjacency builds both directions', () => {
  const { out, in: inn } = adjacency(toy());
  ok(out.has('a.js'));
  ok(inn.has('b.js'));
});

test('stats reports type + tier counts', () => {
  const s = stats(toy());
  strictEqual(s.byType.imports, 2);
  strictEqual(s.byType.defines, 1);
  strictEqual(s.byTier[0], 3);
});
