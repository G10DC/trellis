// lib/persist.js — SQLite persistence via node:sqlite (built-in, zero native install).
// Normalized schema (nodes, edges, meta). WITH RECURSIVE for transitive closure over indexes.
// Content-addressed by node id; mirrored indexes on edges(from) and edges(to) for both directions.
// Phase 2 of the roadmap.

import { DatabaseSync } from 'node:sqlite';
import { createGraph, addNode, addEdge } from './graph.js';

const SCHEMA_VERSION = 1;

function ensureSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
    CREATE TABLE IF NOT EXISTS nodes (
      id TEXT PRIMARY KEY, kind TEXT, file TEXT, line INTEGER, exported INTEGER, labels TEXT
    );
    CREATE TABLE IF NOT EXISTS edges (
      seq INTEGER PRIMARY KEY AUTOINCREMENT,
      from_id TEXT NOT NULL, to_id TEXT NOT NULL, type TEXT NOT NULL,
      tier INTEGER NOT NULL, inferred INTEGER NOT NULL, evidence TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_edges_from ON edges(from_id);
    CREATE INDEX IF NOT EXISTS idx_edges_to ON edges(to_id);
    CREATE INDEX IF NOT EXISTS idx_edges_type ON edges(type);
  `);
  const row = db.prepare('SELECT value FROM meta WHERE key = ?').get('schema_version');
  if (!row) db.prepare('INSERT INTO meta(key,value) VALUES (?,?)').run('schema_version', String(SCHEMA_VERSION));
}

function parseLabels(s) {
  try { const a = JSON.parse(s); return Array.isArray(a) ? a : []; } catch { return []; }
}

/** Persist a graph to SQLite (idempotent: wipes + rebuilds). */
export function saveToSQLite(graph, dbPath) {
  const db = new DatabaseSync(dbPath);
  try {
    ensureSchema(db);
    db.exec('DELETE FROM edges; DELETE FROM nodes;');
    const insNode = db.prepare('INSERT OR REPLACE INTO nodes(id,kind,file,line,exported,labels) VALUES (?,?,?,?,?,?)');
    const insEdge = db.prepare('INSERT INTO edges(from_id,to_id,type,tier,inferred,evidence) VALUES (?,?,?,?,?,?)');
    db.exec('BEGIN');
    for (const n of graph.nodes.values()) {
      insNode.run(n.id, n.kind, n.file, n.line ?? 0, n.exported ? 1 : 0, JSON.stringify(n.labels || []));
    }
    for (const e of graph.edges) {
      insEdge.run(e.from, e.to, e.type, e.tier ?? 0, e.inferred ? 1 : 0, e.evidence ?? null);
    }
    db.exec('COMMIT');
  } finally {
    db.close();
  }
  return { nodes: graph.nodes.size, edges: graph.edges.length };
}

/** Load a graph from SQLite. */
export function loadFromSQLite(dbPath) {
  const db = new DatabaseSync(dbPath);
  try {
    ensureSchema(db);
    const g = createGraph();
    for (const r of db.prepare('SELECT * FROM nodes').all()) {
      addNode(g, { id: r.id, kind: r.kind, file: r.file, line: r.line, exported: !!r.exported, labels: parseLabels(r.labels) });
    }
    for (const r of db.prepare('SELECT * FROM edges').all()) {
      addEdge(g, { from: r.from_id, to: r.to_id, type: r.type, tier: r.tier, inferred: !!r.inferred, evidence: r.evidence ?? undefined });
    }
    return g;
  } finally {
    db.close();
  }
}

function typesClause(types) {
  if (!types || !types.length) return { sql: '', params: [] };
  const arr = Array.isArray(types) ? types : [types];
  return { sql: ` AND type IN (${arr.map(() => '?').join(',')})`, params: arr };
}

/**
 * WITH RECURSIVE transitive closure directly in SQL (indexed, no JS BFS).
 * reverse=true  -> dependents of seed (blast radius).
 * reverse=false -> dependencies of seed (update cascade).
 * Returns Map<nodeId, depth>.
 */
export function closureSQLite(dbPath, seed, { depth = 5, reverse = false, types = null } = {}) {
  const db = new DatabaseSync(dbPath);
  try {
    ensureSchema(db);
    const { sql: tc, params: tp } = typesClause(types);
    // edge: from_id -> to_id (from uses to). forward follows to_id; reverse follows from_id.
    const startCol = reverse ? 'from_id' : 'to_id';
    const nextCol = reverse ? 'to_id' : 'from_id';
    const sql = `
      WITH RECURSIVE reach(id, depth) AS (
        SELECT ${startCol}, 1 FROM edges WHERE ${nextCol} = ?${tc}
        UNION ALL
        SELECT e.${startCol}, r.depth + 1 FROM edges e JOIN reach r ON e.${nextCol} = r.id
        WHERE r.depth < ?${tc}
      )
      SELECT id, MIN(depth) AS depth FROM reach GROUP BY id`;
    const rows = db.prepare(sql).all(seed, ...tp, depth, ...tp);
    const m = new Map();
    for (const r of rows) m.set(r.id, r.depth);
    return m;
  } finally {
    db.close();
  }
}

/** Integrity check: dangling edges (to/from missing nodes). */
export function integrityCheck(dbPath) {
  const db = new DatabaseSync(dbPath);
  try {
    ensureSchema(db);
    const dangling = db.prepare(`
      SELECT e.from_id, e.to_id, e.type FROM edges e
      LEFT JOIN nodes n1 ON n1.id = e.from_id
      LEFT JOIN nodes n2 ON n2.id = e.to_id
      WHERE n1.id IS NULL OR n2.id IS NULL`).all();
    return { ok: dangling.length === 0, dangling };
  } finally {
    db.close();
  }
}
