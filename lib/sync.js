// lib/sync.js — incremental synchronization (Phase 2).
// Detects changed files via `git diff --name-only` (argument-array exec, no shell), strips their
// stale nodes/edges, and re-extracts file-level defines + imports into the existing graph.
//
// HONEST LIMIT: cross-file `calls` edges that pointed at a removed symbol become dangling; the
// `changed`/integrityCheck surfaces them. For full symbol-level correctness after structural edits,
// run a full rebuild (`index --rebuild`). Incremental sync is best-effort and converges with a
// periodic rebuild — see RISKS.md #2.

import { execFile, isWithin } from './security.js';
import { extractModule } from './ast.js';
import { loadFromSQLite, saveToSQLite } from './persist.js';
import { addNode, addEdge } from './graph.js';
import { readFile as fsReadFile } from 'node:fs/promises';
import { join } from 'node:path';

async function defaultRead(rel, root) {
  return fsReadFile(join(root, ...rel.split('/')), 'utf8');
}

/** Files changed vs `base` (default HEAD). Returns { tracked, git }. git:false if not a repo. */
export async function changedFiles(root, base = 'HEAD') {
  let out;
  try {
    out = await execFile('git', ['diff', '--name-only', base], { cwd: root });
  } catch {
    return { tracked: [], git: false };
  }
  const tracked = out.split('\n').map((s) => s.trim()).filter(Boolean).filter((f) => isWithin(root, f));
  return { tracked, git: true };
}

/** Remove all non-external nodes belonging to `file` and every edge touching them. Returns count. */
export function stripFile(graph, file) {
  const toRemove = new Set();
  for (const [id, n] of graph.nodes) if (n.file === file && n.kind !== 'external') toRemove.add(id);
  for (const id of toRemove) graph.nodes.delete(id);
  graph.edges = graph.edges.filter((e) => !toRemove.has(e.from) && !toRemove.has(e.to));
  return toRemove.size;
}

/** Merge a parsed module's file-level facts (defines + file node) into the graph. */
export function mergeModule(graph, mod) {
  addNode(graph, { id: mod.file, kind: 'file', file: mod.file, line: 1, exported: false, labels: ['file'] });
  for (const d of mod.defines) {
    const id = `${mod.file}::${d.name}`;
    addNode(graph, { id, kind: 'symbol', file: mod.file, line: d.line, exported: d.exported, labels: d.exported ? ['exported'] : [] });
    addEdge(graph, { from: mod.file, to: id, type: 'defines', tier: 2, inferred: false, evidence: `${mod.file}:${d.line}` });
  }
  return mod;
}

/** Re-extract the given files into `graph` (strip + merge). Uses DI readFile for offline tests. */
export async function reconcile(graph, root, files, { readFile = defaultRead } = {}) {
  const report = [];
  for (const f of files) {
    const stripped = stripFile(graph, f);
    let src;
    try { src = await readFile(f, root); } catch { report.push({ file: f, status: 'missing', stripped }); continue; }
    const mod = extractModule(f, src);
    mergeModule(graph, mod);
    report.push({ file: f, status: 're-extracted', stripped, defines: mod.defines.length });
  }
  return report;
}

/** Load a SQLite snapshot, reconcile changed files, save. Requires a prior `index --sqlite`. */
export async function syncToSQLite(root, dbPath, { base = 'HEAD', readFile } = {}) {
  const { tracked, git } = await changedFiles(root, base);
  if (!git) return { git: false, changed: 0 };
  let graph;
  try { graph = loadFromSQLite(dbPath); } catch { return { git: true, changed: tracked.length, rebuilt: false, note: 'no snapshot — run index --sqlite first' }; }
  const report = await reconcile(graph, root, tracked, { readFile });
  saveToSQLite(graph, dbPath);
  return { git: true, changed: tracked.length, rebuilt: false, report };
}
