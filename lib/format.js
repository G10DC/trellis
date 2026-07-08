// lib/format.js — agent-facing output. Tiered: brief -> full.
// Compact by design: the agent reasons over a small, labeled set.

export function formatBrief(res) {
  const lines = [res.summary, ''];
  if (res.top.length) {
    lines.push('Top dependents at risk (nearest first):');
    for (const t of res.top) {
      const prov = t.inferred ? ', inferred' : '';
      lines.push(`  [d${t.depth}] ${t.node}  (${t.edge ?? '?'}, tier ${t.tier ?? '?'}${prov})`);
    }
  } else {
    lines.push('No dependents found in the graph.');
  }
  if (res.reasons.length) {
    lines.push('');
    for (const r of res.reasons) lines.push(`· ${r}`);
  }
  return lines.join('\n');
}

export function formatFull(res, { blast, cascade } = {}) {
  const lines = [formatBrief(res), '', `honest: ${res.honest}`, ''];
  if (blast && blast.size) {
    lines.push(`Blast radius (${blast.size}):`);
    for (const [id, d] of blast) lines.push(`  d${d}  ${id}`);
  }
  if (cascade && cascade.size) {
    lines.push('', `Update cascade (${cascade.size}):`);
    for (const [id, d] of cascade) lines.push(`  d${d}  ${id}`);
  }
  return lines.join('\n');
}
