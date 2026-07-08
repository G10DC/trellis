// lib/graph.js — Trellis graph model + bidirectional reachability.
// Pure: no I/O, no network. Unit-testable.
//
// Node: { id, kind, file, line, exported, labels? }
//   kind ∈ file | symbol | external | entrypoint
// Edge: { from, to, type, tier, inferred, evidence? }
//   type ∈ defines | imports | calls | references | inherits | implements | instantiates | tests | registered | handles
//   tier 0=regex 1=manifest 2=tree-sitter 3=LLM-inferred 4=MCP-resolved
// The graph proves REACHABILITY only — never breakage (see RISKS.md, "edges ≠ impact").

export function createGraph() {
  return { nodes: new Map(), edges: [] };
}

export function addNode(g, n) {
  if (!n.id) throw new Error('node.id required');
  if (!g.nodes.has(n.id)) g.nodes.set(n.id, n);
  return n;
}

export function addEdge(g, e) {
  if (!e.from || !e.to || !e.type) throw new Error('edge {from,to,type} required');
  if (e.tier == null) e.tier = 0;
  if (e.inferred == null) e.inferred = false;
  g.edges.push(e);
  return e;
}

/** Forward ('out') and reverse ('in') adjacency: nodeId -> Edge[]. */
export function adjacency(g) {
  const out = new Map();
  const inn = new Map();
  const push = (m, k, v) => { const a = m.get(k); if (a) a.push(v); else m.set(k, [v]); };
  for (const e of g.edges) {
    push(out, e.from, e);
    push(inn, e.to, e);
  }
  return { out, in: inn };
}

/**
 * Bidirectional reachability (BFS) with optional depth cap and edge-type filter.
 * reverse=false -> forward: what `seed` depends on (the update cascade).
 * reverse=true  -> backward: who depends on `seed` (the blast radius / what breaks).
 * Returns Map<nodeId, depth>.
 */
export function reachability(g, seed, { depth = 5, reverse = false, types = null } = {}) {
  const { out, in: inn } = adjacency(g);
  const adj = reverse ? inn : out;
  const typeSet = types ? new Set(Array.isArray(types) ? types : [types]) : null;
  const seen = new Map([[seed, 0]]);
  let frontier = [seed];
  for (let d = 0; d < depth && frontier.length; d++) {
    const next = [];
    for (const n of frontier) {
      for (const e of adj.get(n) ?? []) {
        if (typeSet && !typeSet.has(e.type)) continue;
        const m = reverse ? e.from : e.to;
        if (!seen.has(m)) { seen.set(m, d + 1); next.push(m); }
      }
    }
    frontier = next;
  }
  return seen;
}

/** Blast radius: who breaks downstream if `seed` changes (reverse reachability, seed excluded). */
export function blastRadius(g, seed, opts = {}) {
  const r = reachability(g, seed, { ...opts, reverse: true });
  r.delete(seed);
  return r;
}

/** Update cascade: what `seed` depends on and must stay consistent with (forward, seed excluded). */
export function cascade(g, seed, opts = {}) {
  const r = reachability(g, seed, { ...opts, reverse: false });
  r.delete(seed);
  return r;
}

/** Edges pointing to/from nodes that no longer exist — stale/dangling refs (used by `changed`). */
export function dangling(g) {
  const out = [];
  for (const e of g.edges) {
    if (!g.nodes.has(e.to)) out.push({ edge: e, missing: 'to' });
    if (!g.nodes.has(e.from)) out.push({ edge: e, missing: 'from' });
  }
  return out;
}

/** Serialize to JSONL (one record per line) and back. Phase-2 persistence preview. */
export function toJSONL(g) {
  const lines = [];
  for (const n of g.nodes.values()) lines.push(JSON.stringify({ t: 'node', ...n }));
  for (const e of g.edges) lines.push(JSON.stringify({ t: 'edge', ...e }));
  return lines.join('\n');
}

export function fromJSONL(text) {
  const g = createGraph();
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    const r = JSON.parse(line);
    if (r.t === 'node') { const { t, ...n } = r; addNode(g, n); }
    else if (r.t === 'edge') { const { t, ...e } = r; addEdge(g, e); }
  }
  return g;
}

/** Stats for `index` output. */
export function stats(g) {
  const byType = new Map();
  const byTier = new Map();
  for (const e of g.edges) {
    byType.set(e.type, (byType.get(e.type) || 0) + 1);
    byTier.set(e.tier, (byTier.get(e.tier) || 0) + 1);
  }
  return {
    nodes: g.nodes.size,
    edges: g.edges.length,
    byType: Object.fromEntries(byType),
    byTier: Object.fromEntries(byTier),
  };
}

/**
 * Strongly-Connected-Components condensation (Tarjan, iterative to avoid stack overflow).
 * Returns { components: string[][], condensation: Map<componentId, string[]> }.
 * Collapse cycles into single nodes so transitive closure is computed over a DAG (Phase 3).
 */
export function scc(g) {
  const { out } = adjacency(g);
  let index = 0;
  const idx = new Map();
  const low = new Map();
  const onStack = new Set();
  const stack = [];
  const components = [];
  // iterative Tarjan
  for (const start of g.nodes.keys()) {
    if (idx.has(start)) continue;
    const work = [[start, (out.get(start) ?? [])[Symbol.iterator]()]];
    idx.set(start, index); low.set(start, index); index++;
    stack.push(start); onStack.add(start);
    while (work.length) {
      const [v, it] = work[work.length - 1];
      let adv = it.next();
      if (adv.done) {
        if (low.get(v) === idx.get(v)) {
          const comp = [];
          let w;
          do { w = stack.pop(); onStack.delete(w); comp.push(w); } while (w !== v);
          components.push(comp);
        }
        work.pop();
        if (work.length) {
          const [parent] = work[work.length - 1];
          low.set(parent, Math.min(low.get(parent), low.get(v)));
        }
      } else {
        const w = adv.value.to;
        if (!idx.has(w)) {
          idx.set(w, index); low.set(w, index); index++;
          stack.push(w); onStack.add(w);
          work.push([w, (out.get(w) ?? [])[Symbol.iterator]()]);
        } else if (onStack.has(w)) {
          low.set(v, Math.min(low.get(v), idx.get(w)));
        }
      }
    }
  }
  return { components, count: components.length };
}

/**
 * Bounded reachability with truncation reporting (Phase 3).
 * Like reachability(), but also reports whether it was truncated and how many further nodes exist.
 */
export function reachabilityBounded(g, seed, { depth = 5, reverse = false, types = null } = {}) {
  const { out, in: inn } = adjacency(g);
  const adj = reverse ? inn : out;
  const typeSet = types ? new Set(Array.isArray(types) ? types : [types]) : null;
  const seen = new Map([[seed, 0]]);
  let frontier = [seed];
  let truncated = false;
  let nextLayer = [];
  for (let d = 0; d < depth && frontier.length; d++) {
    nextLayer = [];
    for (const n of frontier) {
      for (const e of adj.get(n) ?? []) {
        if (typeSet && !typeSet.has(e.type)) continue;
        const m = reverse ? e.from : e.to;
        if (!seen.has(m)) { seen.set(m, d + 1); nextLayer.push(m); }
      }
    }
    frontier = nextLayer;
  }
  // if there are still outgoing edges from the frontier, we truncated
  if (frontier.length) {
    for (const n of frontier) {
      for (const e of adj.get(n) ?? []) {
        if (typeSet && !typeSet.has(e.type)) continue;
        const m = reverse ? e.from : e.to;
        if (!seen.has(m)) { truncated = true; break; }
      }
      if (truncated) break;
    }
  }
  return { reached: seen, truncated, depth };
}

/**
 * Memoized reachability (Phase 3). Cache keyed by seed+opts; invalidate by bumping `g.version`
 * (callers bump it on mutation). Pass a shared cache Map across calls for a session.
 */
export function memoizedReachability(g, seed, opts = {}, cache = new Map()) {
  const { depth = 5, reverse = false, types = null } = opts;
  const key = `${seed}|${depth}|${reverse ? 1 : 0}|${types ? (Array.isArray(types) ? types : [types]).sort().join(',') : ''}|v${g.version || 0}`;
  if (cache.has(key)) return cache.get(key);
  const r = reachability(g, seed, opts);
  cache.set(key, r);
  return r;
}
