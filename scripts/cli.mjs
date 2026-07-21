#!/usr/bin/env node
// scripts/cli.mjs — Trellis CLI. Builds an in-memory dependency graph and answers
// pre-edit impact questions with a PASS/WARN/BLOCK verdict.
//
//   impact <root> <node> [--depth N] [--change ...] [--full]
//   index  <root> [--out .trellis/graph.jsonl]
//   locate <root> "<query>"
//   changed <root>
//   audit

import { buildGraph } from '../lib/extract.js';
import {
  blastRadius, cascade, adjacency, dangling,
  toJSONL, fromJSONL, stats,
} from '../lib/graph.js';
import { gate, CHANGE } from '../lib/gate.js';
import { formatBrief, formatFull } from '../lib/format.js';
import { prImpact } from '../lib/pr.js';
import { execFile } from '../lib/security.js';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

function parseFlags(args) {
  const flags = {};
  const pos = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq > 2) { flags[a.slice(2, eq)] = a.slice(eq + 1); continue; }
      const key = a.slice(2);
      const next = args[i + 1];
      if (next === undefined || next.startsWith('--')) flags[key] = true; // boolean flag
      else { flags[key] = next; i++; }
    } else pos.push(a);
  }
  return { flags, pos };
}

const CHANGES = new Set(Object.values(CHANGE));

async function impactCmd({ flags, pos }) {
  const root = pos[0];
  const seed = pos[1];
  if (!root || !seed) {
    console.error('usage: impact <root> <node> [--depth N] [--change body-only|signature|rename|add|delete] [--full]');
    process.exit(2);
  }
  const { graph } = await buildGraph(root);
  const depth = Number(flags.depth || 5);
  const change = CHANGES.has(flags.change) ? flags.change : CHANGE.BODY;

  const blast = blastRadius(graph, seed, { depth });
  const casc = cascade(graph, seed, { depth });

  // Collect edges traversed in the blast (reverse adjacency of seed + blast nodes).
  const { in: inn } = adjacency(graph);
  const blastEdges = [];
  for (const id of [seed, ...blast.keys()]) for (const e of inn.get(id) ?? []) blastEdges.push(e);

  const res = gate({ blast, cascade: casc, change, blastEdges });
  console.log(flags.full ? formatFull(res, { blast, cascade: casc }) : formatBrief(res));
}

async function indexCmd({ flags, pos }) {
  const root = pos[0];
  if (!root) { console.error('usage: index <root> [--out path]'); process.exit(2); }
  const { graph, manifest, unresolved } = await buildGraph(root);
  console.log(JSON.stringify(stats(graph), null, 2));
  console.log(`externals=${manifest.externals.length} entrypoints=${manifest.entrypoints.length} unresolved-imports=${unresolved.length}`);
  if (flags.out !== undefined) {
    const out = flags.out === true ? join(root, '.trellis', 'graph.jsonl') : flags.out;
    await mkdir(dirname(out), { recursive: true });
    await writeFile(out, toJSONL(graph));
    console.log(`snapshot -> ${out}`);
  }
}

async function locateCmd({ pos }) {
  const root = pos[0];
  const q = pos[1];
  if (!root || !q) { console.error('usage: locate <root> "<query>"'); process.exit(2); }
  const { graph } = await buildGraph(root);
  const ql = q.toLowerCase();
  const seeds = [...graph.nodes.keys()].filter((id) => id.toLowerCase().includes(ql)).slice(0, 20);
  for (const s of seeds) console.log(`${s}  (blast=${blastRadius(graph, s, { depth: 3 }).size})`);
  if (!seeds.length) console.log('no matches');
}

async function changedCmd({ pos }) {
  const root = pos[0];
  if (!root) { console.error('usage: changed <root>  (requires .trellis/graph.jsonl)'); process.exit(2); }
  let txt;
  try { txt = await readFile(join(root, '.trellis', 'graph.jsonl'), 'utf8'); }
  catch { console.error('no snapshot: run `index <root> --out .trellis/graph.jsonl` first'); process.exit(2); }
  const d = dangling(fromJSONL(txt));
  console.log(`dangling edges: ${d.length}`);
  for (const x of d.slice(0, 50)) console.log(`  ${x.edge.from} -[${x.edge.type}]-> ${x.edge.to}  (missing ${x.missing})`);
}

async function auditCmd() {
  try {
    const p = fileURLToPath(new URL('../templates/adversarial-audit.md', import.meta.url));
    console.log(await readFile(p, 'utf8'));
  } catch { console.log('(adversarial-audit.md template missing)'); }
}

async function prCmd({ flags, pos }) {
  const root = pos[0];
  if (!root) { console.error('usage: pr <root> [--base HEAD]'); process.exit(2); }
  const base = flags.base || 'HEAD';
  let diff;
  try {
    diff = await execFile('git', ['diff', base], { cwd: root });
  } catch {
    console.error(`git diff failed (not a repo, or no base '${base}')`);
    process.exit(2);
  }
  const { graph } = await buildGraph(root);
  const r = prImpact(graph, diff);
  console.log(`Changed files:   ${r.files.length}`);
  console.log(`Changed symbols: ${r.changedSymbols.length}`);
  r.changedSymbols.forEach((s) => console.log(`  ~ ${s}`));
  console.log(`\nWhat could break (${r.couldBreak.length}):`);
  r.couldBreak.forEach((s) => console.log(`  ! ${s}`));
  console.log(`\nWhat to test (${r.toTest.length}):`);
  r.toTest.forEach((s) => console.log(`  ? ${s}`));
}

const HELP = `trellis — dependency graph + pre-edit blast radius (graph-first, processing engine-second)

commands:
  impact <root> <node> [--depth N] [--change body-only|signature|rename|add|delete] [--full]
      Build the graph in-memory, compute blast radius + update cascade, emit a verdict.
  index  <root> [--out .trellis/graph.jsonl]
      Build + print stats; optionally persist a snapshot (Phase-2 preview).
  locate <root> "<query>"
      Find nodes by name and show their blast size (graph-guided localization).
  changed <root>
      Report dangling edges vs a prior snapshot (post-edit hygiene).
  audit
      Print the adversarial dependency-audit prompt (run before committing).
  pr <root> [--base HEAD]
      Parse 'git diff', compute what could break and what to test (local, privacy-preserving).`;

const [cmd, ...rest] = process.argv.slice(2);
const parsed = parseFlags(rest);

try {
  switch (cmd) {
    case 'impact': await impactCmd(parsed); break;
    case 'index': await indexCmd(parsed); break;
    case 'locate': await locateCmd(parsed); break;
    case 'changed': await changedCmd(parsed); break;
    case 'audit': await auditCmd(); break;
    case 'pr': await prCmd(parsed); break;
    case 'help':
    case undefined: console.log(HELP); break;
    default: console.error(`unknown command: ${cmd}\n\n${HELP}`); process.exit(2);
  }
} catch (e) {
  console.error('✖', e.message);
  process.exit(1);
}
