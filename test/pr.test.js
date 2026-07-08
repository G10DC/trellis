import { test } from 'node:test';
import { strictEqual, ok } from 'node:assert';
import { createGraph, addNode, addEdge } from '../lib/graph.js';
import { parseDiff, changedSymbols, prImpact } from '../lib/pr.js';

const DIFF = `diff --git a/src/auth.js b/src/auth.js
index 123..456 100644
--- a/src/auth.js
+++ b/src/auth.js
@@ -2,3 +2,3 @@
 export function validate(t) {
-  return !!t;
+  return t && t.length > 1;
 }
diff --git a/README.md b/README.md
--- a/README.md
+++ b/README.md
@@ -1,1 +1,1 @@
-old
+new
`;

function graph() {
  const g = createGraph();
  addNode(g, { id: 'src/auth.js', kind: 'file', file: 'src/auth.js', line: 1, exported: false, labels: [] });
  addNode(g, { id: 'src/auth.js::validate', kind: 'symbol', file: 'src/auth.js', line: 2, exported: true, labels: [] });
  addNode(g, { id: 'src/api.js', kind: 'file', file: 'src/api.js', line: 1, exported: false, labels: [] });
  addEdge(g, { from: 'src/api.js', to: 'src/auth.js::validate', type: 'calls', tier: 2, inferred: false });
  return g;
}

test('parseDiff extracts changed files + hunk ranges', () => {
  const f = parseDiff(DIFF);
  strictEqual(f.length, 2);
  strictEqual(f[0].file, 'src/auth.js');
  strictEqual(f[0].hunks[0].start, 2);
});

test('changedSymbols finds symbols whose declaration line is in a hunk', () => {
  const g = graph();
  const syms = changedSymbols(g, 'src/auth.js', [{ start: 2, len: 3 }]);
  ok(syms.includes('src/auth.js::validate'));
});

test('prImpact lists what could break + what to test', () => {
  const r = prImpact(graph(), DIFF);
  ok(r.changedSymbols.includes('src/auth.js::validate'));
  ok(r.couldBreak.includes('src/api.js')); // api.js calls validate -> at risk
  ok(r.toTest.includes('src/api.js'));
});

test('prImpact adds the file itself when no symbol is hit (e.g. README)', () => {
  const r = prImpact(graph(), DIFF);
  ok(r.toTest.includes('README.md'));
});
