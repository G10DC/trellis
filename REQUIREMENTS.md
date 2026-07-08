# Trellis — Requirements

## Functional
- **F1** — Build an in-memory dependency graph from a project root: nodes (file / symbol / external / entrypoint)
  and typed edges (`defines`, `imports`, …) with `tier` + `inferred` + `evidence`.
- **F2** — tier-0 regex extraction for the JS/TS family: `import`/`require` → `imports`; `function|class|const|let|var`
  → `defines` (with `exported` flag).
- **F3** — tier-1 manifest extraction (`package.json`): externals + entrypoints; bare imports resolve to `external:` nodes.
- **F4** — Bidirectional reachability with depth cap and edge-type filter; `blastRadius` (reverse), `cascade` (forward),
  `impact` (both).
- **F5** — Pre-edit gate: `PASS`/`WARN`/`BLOCK` verdict with `confidence` and `change-type`, derived from blast size +
  change-type + edge tiers; every result carries the `honest` caveat.
- **F6** — Commands: `impact`, `index` (with optional JSONL snapshot), `locate`, `changed` (dangling edges), `audit`.
- **F7** — Compact, labeled, tiered output (one-line / brief / full).

## Non-functional / constraints
- **N1** — Zero native runtime dependencies (Node stdlib only). `devDependencies` are lint/test-only.
- **N2** — No network at runtime; no arbitrary code execution from inputs.
- **N3** — Static scan only: never `require`/`import`/`marshal`-deserialize target code to analyze it.
- **N4** — Scoped to the project boundary; never write outside the project root.
- **N5** — The graph store (`.trellis/`) is gitignored by default; no verbatim source retention beyond what edges require.
- **N6** — Pure core (`lib/graph.js`, `lib/gate.js`) is I/O-free and unit-testable offline.
- **N7** — DI on the extractor (`buildGraph(root, { readFile, listFiles })`) for offline tests without ESM mocking.
- **N8** — Honesty is first-class: edge tiers + inferred flags + per-verdict confidence + caveat are mandatory, not optional.
- **N9** — Minimal by default: persistence, incremental sync, multi-language, and tree-sitter are explicitly Phase 2+ and
  must be justified by the Phase-0 study (`ROADMAP.md`).

## Out of scope (MVP)
- Symbol-level `calls` / `references` (tier 2, Phase 2).
- LLM-inferred implicit edges (tier 3, Phase 3).
- Persistence + incremental sync (Phase 2).
- Languages outside the JS/TS family (Phase 4).
- Proven breakage analysis (non-goal — Trellis is reachability-based triage).
