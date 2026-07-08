# Impact algorithm

## Reachability (shipped, `lib/graph.js`)
Bidirectional BFS over the adjacency lists:
- `reverse=false` → forward (`out` adjacency) → `cascade` (what `seed` depends on).
- `reverse=true` → backward (`in` adjacency) → `blastRadius` (who depends on `seed`).
- `depth` caps the traversal (default 5); `types` filters by edge type.
- Returns `Map<nodeId, depth>`; the seed is excluded from `blastRadius`/`cascade`.

```js
reachability(g, seed, { depth, reverse, types })
blastRadius(g, seed, opts)   // reverse
cascade(g, seed, opts)       // forward
impact(g, seed, opts)        // { blast, cascade }
```

## Gate (shipped, `lib/gate.js`)
`gate({ blast, cascade, change, blastEdges })` → `{ verdict, confidence, summary, top, reasons, honest }`:

| change        | blast=0 | small | large |
|---------------|---------|-------|-------|
| body-only     | PASS    | PASS  | WARN  |
| signature     | PASS*   | WARN  | BLOCK |
| rename        | PASS*   | WARN  | WARN  |
| delete        | WARN    | BLOCK | BLOCK |
| add           | PASS    | PASS  | PASS  |

\* with the tier-0-only "absence is not proof" caveat.

- `confidence`: `high` (tier ≤ 1, no inferred) → `medium` (tier 2) → `low` (tier 3 / inferred edges in blast).
- `top`: up to 8 dependents, nearest-first, with edge type/tier/inferred.
- `honest`: the fixed caveat string on every result.

## Future (Phase 2–3)
- **SCC condensation**: collapse strongly-connected components into single nodes so closure is computed over a DAG
  (cycles / mutual recursion no longer risk non-termination).
- **Depth-bounded closure with truncation reporting**: "blast radius truncated at depth 5; N further nodes not shown."
- **Memoized per-node-fingerprint closure**: invalidated only when that node's edge set changes (survives incremental updates).
- **Edge-type filters as the precision lever**: structural (`inherits`/`implements`) for a hard-breakage view;
  `calls`+`imports` for a compile/relink view; widen to `registered`/`handles` for a runtime-behavior view.
- **Change-type refinement** (Phase 3): attach change-type to the triggering edit and discount/amplify the candidate
  set — the feature that converts Trellis from a wolf-crier into a triage tool (`RISKS.md` #1 mitigation).
