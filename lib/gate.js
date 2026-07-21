// lib/gate.js — pre-edit verdict. Translates a reachability set + change-type into
// PASS/WARN/BLOCK with confidence. The graph proves reachability; the gate decides urgency.
//
// INVARIANT (RISKS.md): reachability != breakage. The verdict is a TRIAGE signal, never a proof.
// graph-first / processing engine-second: the model reasons over this proven output; it never invents edges.

export const CHANGE = Object.freeze({
  BODY: 'body-only',
  SIGNATURE: 'signature',
  RENAME: 'rename',
  ADD: 'add',
  DELETE: 'delete',
});

/** Classify the triggering edit. Prefer structured input from the agent; fall back to heuristics. */
export function classifyChange({ kind, nameChanged, touchedDeclaration } = {}) {
  if (nameChanged) return CHANGE.RENAME;
  if (kind === 'delete') return CHANGE.DELETE;
  if (kind === 'add') return CHANGE.ADD;
  if (touchedDeclaration) return CHANGE.SIGNATURE;
  return CHANGE.BODY;
}

/**
 * Decide a verdict from the impact set + change-type.
 *
 * @param {object} input
 * @param {Map} input.blast       reverse reachability (who depends on me) — from graph.blastRadius
 * @param {Map} input.cascade     forward reachability (what I depend on) — from graph.cascade
 * @param {string} input.change   one of CHANGE.*
 * @param {object[]} [input.blastEdges] edges traversed in the blast, for tier/provenance
 * @returns {{verdict, confidence, summary, top:object[], reasons:string[], honest:string}}
 */
export function gate({ blast, cascade, change, blastEdges = [] }) {
  const b = blast ? blast.size : 0;
  const c = cascade ? cascade.size : 0;

  const tiers = blastEdges.map((e) => e.tier ?? 0);
  const maxTier = tiers.length ? Math.max(...tiers) : 0;
  const inferredCount = blastEdges.filter((e) => e.inferred).length;

  // Confidence: lower when edges come from high tiers or are processing engine-inferred.
  let confidence = 'high';
  if (maxTier >= 3 || inferredCount > 0) confidence = 'low';
  else if (maxTier >= 2) confidence = 'medium';

  let verdict = 'PASS';
  const reasons = [];

  if (b === 0) {
    verdict = 'PASS';
    reasons.push('no dependents found in the graph');
    if (maxTier < 2) {
      reasons.push('graph is tier-0/1 only (imports + manifests); symbol-level callers are NOT extracted — absence of edges is NOT proof of absence of dependents');
    }
  } else if (change === CHANGE.BODY) {
    verdict = b <= 3 ? 'PASS' : 'WARN';
    reasons.push(`body-only change; ${b} dependents reach this node, but most body changes do not alter the contract`);
  } else if (change === CHANGE.SIGNATURE) {
    verdict = b <= 2 ? 'WARN' : 'BLOCK';
    reasons.push(`signature change directly risks ${b} dependents`);
  } else if (change === CHANGE.RENAME) {
    verdict = 'WARN';
    reasons.push('rename touches all references; the graph likely OVER-reports — verify each dependent manually');
  } else if (change === CHANGE.DELETE) {
    verdict = b === 0 ? 'WARN' : 'BLOCK';
    reasons.push(`deleting a node with ${b} dependents is high-risk`);
  } else {
    // ADD
    verdict = 'PASS';
    reasons.push('additive change; no existing dependent is at risk');
  }

  // Top dependents at risk, nearest first (depth from the blast map).
  const top = [...(blast?.entries() ?? [])]
    .sort((a, b) => a[1] - b[1])
    .slice(0, 8)
    .map(([id, depth]) => {
      const e = blastEdges.find((x) => (x.from === id || x.to === id));
      return { node: id, depth, edge: e?.type, tier: e?.tier, inferred: !!e?.inferred };
    });

  const honest =
    'Reachability is a CANDIDATE set, not a proven breakage set. Signature-preserving semantic changes are invisible; renames over-report. Verify before acting.';

  const summary = `${verdict} · blast=${b} cascade=${c} change=${change} confidence=${confidence}`;
  return { verdict, confidence, summary, top, reasons, honest };
}
