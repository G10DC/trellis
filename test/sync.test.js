import { test } from 'node:test';
import { strictEqual, ok } from 'node:assert';
import { createGraph, addNode, addEdge } from '../lib/graph.js';
import { extractModule } from '../lib/ast.js';
import { stripFile, mergeModule, reconcile } from '../lib/sync.js';

const SRC_V1 = `export function oldName() { return 1; }`;
const SRC_V2 = `export function newName() { return 2; }`;

function graphWith(file, src) {
  const g = createGraph();
  mergeModule(g, extractModule(file, src));
  return g;
}

test('stripFile removes a file symbols + edges touching them', () => {
  const g = createGraph();
  addNode(g, { id: 'a.js', kind: 'file', file: 'a.js', line: 1, exported: false });
  addNode(g, { id: 'a.js::x', kind: 'symbol', file: 'a.js', line: 1, exported: true, labels: [] });
  addNode(g, { id: 'b.js', kind: 'file', file: 'b.js', line: 1, exported: false });
  addEdge(g, { from: 'a.js', to: 'a.js::x', type: 'defines', tier: 2, inferred: false });
  addEdge(g, { from: 'b.js', to: 'a.js::x', type: 'calls', tier: 2, inferred: false });
  const n = stripFile(g, 'a.js');
  ok(n >= 2); // a.js + a.js::x
  ok(!g.nodes.has('a.js::x'));
  strictEqual(g.edges.length, 0); // both edges touched a.js::x or a.js
});

test('reconcile strips + re-extracts a changed file (rename)', async () => {
  const g = graphWith('m.js', SRC_V1);
  ok(g.nodes.has('m.js::oldName'));
  const report = await reconcile(g, 'FAKE', ['m.js'], { readFile: async () => SRC_V2 });
  strictEqual(report[0].status, 're-extracted');
  ok(!g.nodes.has('m.js::oldName'));
  ok(g.nodes.has('m.js::newName'));
});

test('reconcile reports missing files (non-fatal)', async () => {
  const g = graphWith('m.js', SRC_V1);
  const report = await reconcile(g, 'FAKE', ['gone.js'], { readFile: async () => { throw new Error('ENOENT'); } });
  strictEqual(report[0].status, 'missing');
  ok(g.nodes.has('m.js::oldName')); // untouched
});
