// lib/llm-edges.js — merge tier-3 LLM-inferred edges into a graph (Phase 3).
// The LLM returns JSON edges (see templates/tier3-extract.md); this module validates and merges them.
// Rules: every edge needs {from,to,type,evidence}; tier forced to 3; inferred defaults true.
// Nodes referenced that don't exist are added with kind 'symbol' + label 'inferred' so the blast
// radius can reach implicit wiring the deterministic extractor missed.

import { addNode, addEdge } from './graph.js';

const REQUIRED = ['from', 'to', 'type'];

/**
 * @param {object} graph  target graph (mutated)
 * @param {object[]} edges  LLM-returned edges
 * @returns {{accepted:number, rejected:number, reasons:string[]}}
 */
export function applyLLMEdges(graph, edges) {
  const report = { accepted: 0, rejected: 0, reasons: [] };
  if (!Array.isArray(edges)) { report.reasons.push('edges is not an array'); return report; }

  for (const e of edges) {
    if (!e || typeof e !== 'object') { report.rejected++; report.reasons.push(`non-object edge`); continue; }
    const missing = REQUIRED.filter((k) => !e[k]);
    if (missing.length) { report.rejected++; report.reasons.push(`missing ${missing.join(',')} in ${e.from || '?'} -> ${e.to || '?'}`); continue; }
    if (!e.evidence) { report.rejected++; report.reasons.push(`no evidence: ${e.from} -> ${e.to} (${e.type})`); continue; }

    // ensure referenced nodes exist (LLM may surface implicit ones the deterministic tiers missed)
    for (const id of [e.from, e.to]) {
      if (!graph.nodes.has(id)) {
        const file = id.includes('::') ? id.split('::')[0] : id;
        addNode(graph, { id, kind: 'symbol', file, line: 0, exported: false, labels: ['inferred'] });
      }
    }
    addEdge(graph, {
      from: e.from,
      to: e.to,
      type: e.type,
      tier: 3,
      inferred: e.inferred !== false, // default true; LLM may mark false only for statically-grounded-but-tier3 edges
      evidence: e.evidence,
    });
    report.accepted++;
  }
  return report;
}
