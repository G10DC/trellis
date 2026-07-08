import { test } from 'node:test';
import { strictEqual, ok } from 'node:assert';
import { extractFile, detectLang, buildGraph } from '../lib/extract.js';
import { blastRadius } from '../lib/graph.js';

const PY = `from .auth import validate_token
import logging
from fastapi import FastAPI

def handler(request):
    return validate_token(request.token)

class Service:
    pass`;

test('detectLang maps .py', () => {
  strictEqual(detectLang('a.py'), 'py');
});

test('extractFile extracts Python defines + imports + bare externals', () => {
  const { nodes, edges, unresolved } = extractFile('src/api.py', PY, { lang: 'py' });
  ok(nodes.some((n) => n.id === 'src/api.py::handler'));
  ok(nodes.some((n) => n.id === 'src/api.py::Service'));
  ok(edges.some((e) => e.from === 'src/api.py' && e.to === 'src/auth.py' && e.type === 'imports' && e.tier === 0),
    'relative from-import resolves to a file');
  strictEqual(unresolved.length, 2); // logging + fastapi
});

test('buildGraph wires Python cross-file imports + bare -> externals', async () => {
  const files = ['src/auth.py', 'src/api.py', 'package.json'];
  const sources = {
    'src/auth.py': `def validate_token(t):\n    return bool(t)`,
    'src/api.py': PY,
    'package.json': JSON.stringify({ name: 'app', dependencies: { fastapi: '^0.1' } }),
  };
  const { graph, tier } = await buildGraph('FAKE', {
    listFiles: async () => files,
    readFile: async (f) => sources[f],
  });
  strictEqual(tier, 0); // Python uses tier-0 (no acorn)
  ok(blastRadius(graph, 'src/auth.py').has('src/api.py'));
  ok(graph.nodes.has('external:fastapi'));
});
