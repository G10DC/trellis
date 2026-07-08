import { test } from 'node:test';
import { strictEqual, ok } from 'node:assert';
import { extractFile, extractManifest, buildGraph, detectLang } from '../lib/extract.js';
import { blastRadius } from '../lib/graph.js';

const API_SRC = `import { validateToken } from './auth.js';
import express from 'express';

export async function handler(req) {
  return validateToken(req.token);
}

const INTERNAL = 1;`;

test('detectLang maps js/ts family', () => {
  strictEqual(detectLang('src/a.ts'), 'js');
  strictEqual(detectLang('src/a.tsx'), 'js');
  strictEqual(detectLang('src/a.css'), null);
});

test('extractFile emits defines + imports + unresolved bare imports', () => {
  const { nodes, edges, unresolved } = extractFile('src/api.js', API_SRC);
  ok(nodes.some((n) => n.id === 'src/api.js::handler' && n.exported));
  ok(nodes.some((n) => n.id === 'src/api.js::INTERNAL' && !n.exported));
  ok(edges.some((e) => e.from === 'src/api.js' && e.to === 'src/auth.js' && e.type === 'imports' && e.tier === 0));
  ok(edges.some((e) => e.type === 'defines' && e.to === 'src/api.js::handler'));
  strictEqual(unresolved.length, 1); // express
  strictEqual(unresolved[0].spec, 'express');
});

test('extractManifest collects externals + entrypoints', () => {
  const m = extractManifest({
    name: 'x', version: '1.0.0',
    main: 'index.js',
    dependencies: { express: '^4.0.0' },
    devDependencies: { eslint: '^9.0.0' },
    exports: { '.': './dist/main.js', './utils': './dist/utils.js' },
  });
  ok(m.externals.includes('express'));
  ok(m.externals.includes('eslint'));
  ok(m.entrypoints.includes('index.js'));
  ok(m.entrypoints.includes('./dist/main.js'));
});

test('buildGraph via DI (tier-2) wires imports, externals, and symbol-level calls', async () => {
  const files = ['src/auth.js', 'src/api.js', 'package.json'];
  const sources = {
    'src/auth.js': `export function validateToken(t){ return !!t; }`,
    'src/api.js': API_SRC,
    'package.json': JSON.stringify({ name: 'app', main: 'src/index.js', dependencies: { express: '^4' } }),
  };
  const { graph, manifest, unresolved, tier } = await buildGraph('FAKE', {
    listFiles: async () => files,
    readFile: async (f) => sources[f],
  });

  strictEqual(tier, 2);
  // api.js imports auth.js (resolved) -> reverse reachability from auth.js reaches api.js
  ok(blastRadius(graph, 'src/auth.js').has('src/api.js'), 'api.js should be in auth.js blast radius');

  // express resolved to external node via manifest
  ok(graph.nodes.has('external:express'));
  ok(graph.edges.some((e) => e.to === 'external:express' && e.tier === 1));

  // entrypoint captured
  ok(manifest.entrypoints.includes('src/index.js'));
  strictEqual(unresolved.length, 0); // tier-2 resolves bare imports inline

  // symbol-level: api.js::handler calls auth.js::validateToken (resolved cross-file via import)
  ok(graph.nodes.has('src/api.js::handler'));
  ok(graph.nodes.has('src/auth.js::validateToken'));
  ok(graph.edges.some((e) => e.from === 'src/api.js::handler' && e.to === 'src/auth.js::validateToken' && e.type === 'calls' && e.tier === 2),
    'expected a tier-2 calls edge handler->validateToken');
  ok(blastRadius(graph, 'src/auth.js::validateToken').has('src/api.js::handler'),
    'validateToken blast radius should reach handler at symbol level');
});

test('buildGraph falls back to tier-0 when tiers excludes 2', async () => {
  const files = ['src/api.js'];
  const sources = { 'src/api.js': API_SRC };
  const { tier } = await buildGraph('FAKE', {
    listFiles: async () => files,
    readFile: async (f) => sources[f],
    tiers: [0, 1],
  });
  strictEqual(tier, 0);
});

test('buildGraph is non-fatal on a malformed manifest', async () => {
  const { graph } = await buildGraph('FAKE', {
    listFiles: async () => ['package.json', 'a.js'],
    readFile: async (f) => (f === 'package.json' ? '{ not json' : 'export const x = 1;'),
  });
  ok(graph.nodes.has('a.js::x'));
});
