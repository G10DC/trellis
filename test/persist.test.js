import { test } from 'node:test';
import { strictEqual, ok } from 'node:assert';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rmSync } from 'node:fs';
import { createGraph, addNode, addEdge, blastRadius, cascade } from '../lib/graph.js';
import { saveToSQLite, loadFromSQLite, closureSQLite, integrityCheck } from '../lib/persist.js';

const DB = join(tmpdir(), `trellis-test-${process.pid}.sqlite`);

function toy() {
  const g = createGraph();
  for (const id of ['a.js', 'b.js', 'c.js', 'a.js::fn', 'b.js::fn']) addNode(g, { id, kind: 'symbol', file: id, line: 1, exported: false });
  // a imports b imports c; a::fn calls b::fn
  addEdge(g, { from: 'a.js', to: 'b.js', type: 'imports', tier: 0, inferred: false });
  addEdge(g, { from: 'b.js', to: 'c.js', type: 'imports', tier: 0, inferred: false });
  addEdge(g, { from: 'a.js::fn', to: 'b.js::fn', type: 'calls', tier: 2, inferred: false });
  addEdge(g, { from: 'a.js', to: 'a.js::fn', type: 'defines', tier: 2, inferred: false });
  addEdge(g, { from: 'b.js', to: 'b.js::fn', type: 'defines', tier: 2, inferred: false });
  return g;
}

test('save/load round-trip preserves nodes + edges', () => {
  const g = toy();
  saveToSQLite(g, DB);
  const g2 = loadFromSQLite(DB);
  strictEqual(g2.nodes.size, g.nodes.size);
  strictEqual(g2.edges.length, g.edges.length);
});

test('closureSQLite reverse matches in-memory blastRadius', () => {
  saveToSQLite(toy(), DB);
  const inMem = blastRadius(toy(), 'b.js::fn', { depth: 5 });
  const sql = closureSQLite(DB, 'b.js::fn', { depth: 5, reverse: true });
  strictEqual(sql.size, inMem.size);
  ok(sql.has('a.js::fn'));
});

test('closureSQLite forward matches in-memory cascade', () => {
  saveToSQLite(toy(), DB);
  const inMem = cascade(toy(), 'a.js::fn', { depth: 5 });
  const sql = closureSQLite(DB, 'a.js::fn', { depth: 5, reverse: false });
  strictEqual(sql.size, inMem.size);
  ok(sql.has('b.js::fn'));
});

test('closureSQLite honors depth cap', () => {
  saveToSQLite(toy(), DB);
  const sql = closureSQLite(DB, 'c.js', { depth: 1, reverse: true });
  ok(sql.has('b.js'));
  ok(!sql.has('a.js')); // depth 2, capped
});

test('closureSQLite honors edge-type filter', () => {
  saveToSQLite(toy(), DB);
  const callsOnly = closureSQLite(DB, 'a.js::fn', { depth: 5, reverse: false, types: ['calls'] });
  ok(callsOnly.has('b.js::fn'));
  ok(!callsOnly.has('b.js')); // defines edge filtered out
});

test('integrityCheck reports dangling edges', () => {
  const g = createGraph();
  addNode(g, { id: 'a.js', kind: 'file', file: 'a.js', line: 1, exported: false });
  addEdge(g, { from: 'a.js', to: 'ghost.js', type: 'imports', tier: 0, inferred: false });
  saveToSQLite(g, DB);
  const r = integrityCheck(DB);
  strictEqual(r.ok, false);
  ok(r.dangling.length >= 1);
});

test('integrityCheck ok on a clean graph', () => {
  saveToSQLite(toy(), DB);
  strictEqual(integrityCheck(DB).ok, true);
});

test('save is idempotent (wipe + rebuild)', () => {
  saveToSQLite(toy(), DB);
  saveToSQLite(toy(), DB);
  const g2 = loadFromSQLite(DB);
  strictEqual(g2.edges.length, toy().edges.length);
});

test.after(() => { try { rmSync(DB); } catch { /* noop */ } });
