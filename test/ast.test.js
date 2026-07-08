import { test } from 'node:test';
import { strictEqual, ok } from 'node:assert';
import { extractModule, buildSymbolGraph } from '../lib/ast.js';
import { blastRadius, cascade } from '../lib/graph.js';

const AUTH = `export function validateToken(t) { return !!t; }
export function revokeToken(t) { return true; }`;

const API = `import { validateToken } from './auth.js';
import express from 'express';

export async function handler(req) {
  return validateToken(req.token);
}

export function healthcheck() { return { ok: true }; }`;

test('extractModule finds defines (with exported) + imports + calls', () => {
  const m = extractModule('src/api.js', API);
  strictEqual(m.parseError, false);
  ok(m.defines.some((d) => d.name === 'handler' && d.exported));
  ok(m.defines.some((d) => d.name === 'healthcheck'));
  ok(m.imports.some((i) => i.spec === './auth.js' && i.names.includes('validateToken')));
  ok(m.calls.some((c) => c.callee === 'validateToken' && c.enclosing === 'handler'));
});

test('extractModule is non-fatal on broken source', () => {
  const m = extractModule('src/bad.js', 'import { from { broken');
  strictEqual(m.parseError, true);
  strictEqual(m.defines.length, 0);
});

test('buildSymbolGraph resolves cross-file calls via imports (symbol-level blast radius)', () => {
  const modules = [extractModule('src/auth.js', AUTH), extractModule('src/api.js', API)];
  const g = buildSymbolGraph(modules, { externals: ['express'] });

  // handler -calls-> validateToken (resolved across the import)
  ok(g.edges.some((e) => e.from === 'src/api.js::handler' && e.to === 'src/auth.js::validateToken' && e.type === 'calls' && e.tier === 2));
  // reverse reachability from validateToken reaches handler (symbol-level blast radius)
  ok(blastRadius(g, 'src/auth.js::validateToken').has('src/api.js::handler'));
  // express wired as external
  ok(g.nodes.has('external:express'));
});

test('buildSymbolGraph resolves same-file calls', () => {
  const SRC = `function a() { return b(); } function b() { return 1; }`;
  const g = buildSymbolGraph([extractModule('m.js', SRC)], {});
  ok(g.edges.some((e) => e.from === 'm.js::a' && e.to === 'm.js::b' && e.type === 'calls'));
  ok(cascade(g, 'm.js::a').has('m.js::b'));
});

test('buildSymbolGraph captures inheritance', () => {
  const SRC = `class Animal {} class Dog extends Animal {}`;
  const g = buildSymbolGraph([extractModule('m.js', SRC)], {});
  ok(g.edges.some((e) => e.from === 'm.js::Dog' && e.to === 'm.js::Animal' && e.type === 'inherits'));
});
