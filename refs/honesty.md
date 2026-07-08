# Honesty layer

The honesty layer is the feature that separates a tool the agent learns to ignore from one it relies on. It is the
operational expression of the graph-first principle: **the LLM reasons over proven reachability with stated
confidence, never hallucinates impact.**

## Three dimensions on every answer

### 1. change-type (the precision lever)
Classify the triggering edit before computing the verdict (`lib/gate.js#classifyChange`):
- `body-only` — internals changed, contract unchanged → most consumers are **not** at risk. Discount.
- `signature` — the public contract changed → consumers are at risk. Amplify.
- `rename` — name changed → the graph **over-reports** (every reference lights up). Warn and verify each.
- `add` — purely additive → no existing dependent at risk. PASS.
- `delete` — removal → high risk if any dependent exists. BLOCK.

This is what addresses `RISKS.md` #1 *without* full dataflow analysis: it does not prove breakage, but it stops the
graph from crying wolf on the most common edits.

### 2. provenance (where the edge came from)
Every edge carries `tier` + `inferred`:
- tier 0–1 (regex/manifest): syntactic, fast, over-/under-approximate.
- tier 2 (tree-sitter): structural, trustworthy for the languages it covers.
- tier 3 (LLM): `inferred: true`, lower trust, must carry `evidence`.
- tier 4 (MCP): resolved, highest trust.

The agent (and the user) can see *which* edges are guesses. "These 3 dependents are confirmed by tree-sitter; these
2 are LLM-inferred — verify them."

### 3. confidence (the summary verdict)
Derived from the tiers of edges in the blast: `high` → `medium` → `low`. A `low`-confidence `BLOCK` means "many
dependents, but the edges are inferred — look before you act." A `high`-confidence `PASS` on a tier-0-only graph is
still caveated: **absence of edges is not absence of dependents.**

## The invariant
The output is a **candidate set with confidence**, never a mandated, ordered task list. Necessity and ordering belong
to the agent and the user, not the graph (`RISKS.md` #6). The `honest` string is attached to every result so the
caveat cannot be silently dropped downstream.

## The adversarial audit (`templates/adversarial-audit.md`)
Before committing, run the devil's-advocate prompt: it actively hunts for a dependency the editor missed (reverse
reachability gaps, implicit wiring, dynamic dispatch, cross-cutting: migrations/configs/routes/tests). It returns
either concrete missed edges with evidence or `NOTHING MISSED`. This is the closing gate that operationalizes
"non perdere nessuna dipendenza."
