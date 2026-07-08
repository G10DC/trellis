# Trellis — Architecture

## Core idea: a consult-before-cut layer
Trellis sits **between "I'm about to edit" and "I'm editing"**. It does not replace the agent; it conditions the
edit with a proven reachability set and a triage verdict.

```
agent about to edit node X
   │
   ▼
┌──────────────────────── Trellis ────────────────────────┐
│                                                          │
│  1. Extract   tier-0 regex imports + tier-1 manifest     │
│       └─► { nodes, edges }   (every edge tagged tier)    │
│  2. Reach      bidirectional BFS over the graph          │
│       └─► blast radius (reverse) + cascade (forward)     │
│  3. Gate       change-type + blast size + edge tiers     │
│       └─► PASS / WARN / BLOCK + confidence               │
│  4. Audit      (optional) devil's-advocate prompt        │
│       └─► "what dependency did I miss?"                  │
│                                                          │
│  invariant: graph-first / LLM-second — the model        │
│  reasons over proven output, never invents edges         │
└──────────────────────────────────────────────────────────┘
   │
   ▼
agent consults dependents, then edits (informed, not blind)
```

## The modules

### lib/extract.js — tiered extraction
- **Responsibility**: turn source into typed nodes + edges, tagged by tier.
- **Mechanisms**: tier-0 regex (`import`/`require` → `imports`; `function|class|const` → `defines`); tier-1 manifest
  (`package.json` → `external:` nodes + entrypoints). Bare imports resolve to externals.
- **DI**: `buildGraph(root, { readFile, listFiles })` — injectable for offline tests (no ESM mocking).
- **Honest limit**: tier-0 does not resolve extensions or barrel re-exports; symbol-level `calls` need tier 2.

### lib/graph.js — pure reachability core
- **Responsibility**: the graph model + bidirectional reachability. Pure, no I/O.
- **Mechanisms**: `reachability` (BFS, depth cap, edge-type filter), `blastRadius` (reverse), `cascade` (forward),
  `impact` (both), `dangling` (post-edit hygiene), `toJSONL`/`fromJSONL` (snapshot), `stats`.
- **Future** (Phase 3): SCC condensation for cycles, memoized per-node closure.

### lib/gate.js — the verdict
- **Responsibility**: translate reachability + change-type into PASS/WARN/BLOCK with confidence.
- **Mechanism**: change-type discounts body-only changes against structural consumers and amplifies signature changes;
  confidence falls when inferred (tier-3) edges are in the blast.
- **Invariant**: the verdict is triage, never proof — every result carries the `honest` caveat.

### lib/format.js — agent-facing output
- **Responsibility**: compact, labeled output the agent reasons over (brief / full). Compact by design.

### scripts/cli.mjs — the skill surface
- Commands: `impact` (main), `index`, `locate`, `changed`, `audit`. Builds fresh in-memory each run (no staleness in MVP).

## Edge tier model
| tier | source | trust | status |
|---|---|---|---|
| 0 | regex imports/defines | syntactic | ✅ shipped |
| 1 | manifest externals | syntactic | ✅ shipped |
| 2 | tree-sitter (calls/refs/inheritance) | structural | Phase 2 |
| 3 | LLM-inferred (DI/events/reflection) | inferred, low | Phase 3 |
| 4 | MCP code-graph server | resolved | optional |

## Data flow per `impact`
1. `buildGraph(root)` walks files (skipping `node_modules`/`.git`/`.trellis`/`dist`), extracts tier-0/1.
2. `blastRadius(g, X)` + `cascade(g, X)` compute the two reachability sets.
3. Reverse-adjacency edges of the blast are collected for tier/provenance.
4. `gate({ blast, cascade, change, blastEdges })` → verdict + confidence + top dependents.
5. `format*` emits a compact block; `--full` adds the full sets + the honesty line.

## Design constraints (from REQUIREMENTS.md)
- **Zero native deps at runtime** (Node stdlib only) — install is `npm install -D` for lint/tests only.
- **No network, no code execution** from inputs; **static scan only** (never `require`/`import` target code).
- **Scoped** to the project boundary; the graph store is **gitignored** (`.trellis/`).
- **Honesty is first-class**: every edge has a tier; every verdict has a confidence + caveat.
- **Minimal by default**: persistence/incremental/multi-language are Phase 2+ and must earn their keep (`RISKS.md`).
