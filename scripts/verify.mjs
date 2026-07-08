#!/usr/bin/env node
// scripts/verify.mjs — graph integrity check + clean rebuild (Phase 4).
// Reports dangling edges (to/from missing nodes). --rebuild wipes .trellis and rebuilds fresh.
// Exit 0 = clean, 1 = dangling edges present.

import { buildGraph } from '../lib/extract.js';
import { dangling, stats } from '../lib/graph.js';
import { join } from 'node:path';
import { rmSync } from 'node:fs';

const [root, ...rest] = process.argv.slice(2);
const rebuild = rest.includes('--rebuild');

if (!root) {
  console.error('usage: verify <root> [--rebuild]');
  process.exit(2);
}

if (rebuild) {
  try { rmSync(join(root, '.trellis'), { recursive: true, force: true }); } catch { /* noop */ }
  console.log('cleaned .trellis (fresh rebuild)');
}

const { graph } = await buildGraph(root);
const d = dangling(graph);
console.log(JSON.stringify(stats(graph), null, 2));
console.log(`dangling edges: ${d.length}`);
for (const x of d.slice(0, 50)) console.log(`  ${x.edge.from} -[${x.edge.type}]-> ${x.edge.to}  (missing ${x.missing})`);
console.log(d.length === 0 ? 'integrity: OK' : 'integrity: FAIL');
process.exit(d.length === 0 ? 0 : 1);
