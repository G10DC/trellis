// lib/refine.js — semantic refinement (Phase 3).
// Converts a raw reachability set into a per-node, confidence-ranked CANDIDATE set using
// change-type + edge provenance. This is the precision stage that addresses RISKS.md #1:
// it does not prove breakage, but it stops the graph from crying wolf on body-only changes
// and amplifies signature changes, ranking the most-risky dependents first.

import { CHANGE } from './gate.js';

const RISK_RANK = { likely: 0, maybe: 1, unlikely: 2, none: 3 };

function rank(r) { return RISK_RANK[r] ?? 2; }

/**
 * @param {Map} blast       reverse reachability (who depends on seed)
 * @param {Map} cascade     forward reachability (what seed depends on)
 * @param {string} change   one of CHANGE.*
 * @param {object[]} blastEdges  edges traversed in the blast (for provenance)
 * @returns {{nodes:object[], change, summary:string}}
 */
export function refine(blast, cascade, change, blastEdges = []) {
  // index reverse-incoming edges by the dependent node (edge.from in a reverse blast)
  const edgeByNode = new Map();
  for (const e of blastEdges) {
    if (!edgeByNode.has(e.from)) edgeByNode.set(e.from, []);
    edgeByNode.get(e.from).push(e);
  }

  const nodes = [];
  for (const [id, depth] of blast) {
    const es = edgeByNode.get(id) || [];
    const maxTier = es.length ? Math.max(...es.map((e) => e.tier ?? 0)) : 0;
    const inferred = es.some((e) => e.inferred);

    // provenance-based confidence
    let confidence = 'high';
    if (maxTier >= 3 || inferred) confidence = 'low';
    else if (maxTier >= 2) confidence = 'medium';

    // change-type risk: the precision lever
    let risk;
    if (change === CHANGE.BODY) risk = depth <= 1 ? 'unlikely' : 'unlikely';
    else if (change === CHANGE.SIGNATURE) risk = depth <= 1 ? 'likely' : 'maybe';
    else if (change === CHANGE.RENAME) risk = 'maybe'; // over-reports — verify each
    else if (change === CHANGE.DELETE) risk = 'likely';
    else risk = 'none'; // ADD

    nodes.push({
      node: id,
      depth,
      confidence,
      risk,
      edges: es.map((e) => ({ type: e.type, tier: e.tier, inferred: !!e.inferred })),
    });
  }

  // most-risky first, then nearest
  nodes.sort((a, b) => (rank(a.risk) - rank(b.risk)) || (a.depth - b.depth));

  const counts = { likely: 0, maybe: 0, unlikely: 0, none: 0 };
  for (const n of nodes) counts[n.risk]++;
  const summary = `refined: ${counts.likely} likely · ${counts.maybe} maybe · ${counts.unlikely} unlikely (change=${change})`;
  return { nodes, change, summary, counts };
}
