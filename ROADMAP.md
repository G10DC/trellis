# Trellis — Roadmap

The driving principle, set by the adversarial review: **de-risk the load-bearing assumption (edges ≈ impact) before
building infrastructure.** Persistence, incremental sync, and multi-language are Phase-2+ optimizations that must
*earn* their keep at scale — and scale is where the assumption is worst.

## Phase 0 — Prove the premise (de-risk before infra) — ✅ SHIPPED
`scripts/precision-study.mjs` + 6-case corpus (incl. adversarial). Finding: reach recall **1.0**, 1 false negative (signature-preserving semantic change missed by the body-only verdict), 5/6 warning-correct, 0 false alarms.
Build a throwaway in-memory graph for one mature-grammar language (TypeScript) with tree-sitter, forward+reverse
traversal, edge-type filters. Instrument the pre-edit gate against a corpus of real edits — **including the
adversarial cases** (signature-preserving semantic changes, private-helper renames) — and measure recall/precision
vs. ground truth.

- **Exit criterion**: a quantitative answer to "how often does the raw reachability set match real impact, and does
  change-type refinement materially close the gap?" If uncloseable, stop before the spine.

## Phase 1 — Minimal viable graph-first skill — ✅ SHIPPED (this release)
- tier-0 regex extraction (imports + defines) + tier-1 manifest (externals + entrypoints), JS/TS family.
- Pure graph core: `reachability` / `blastRadius` / `cascade` / `impact` / `dangling`, depth + edge-type filters.
- `gate`: PASS/WARN/BLOCK + confidence + change-type; `honest` caveat on every result.
- `impact` / `index` / `locate` / `changed` / `audit` CLI; JSONL snapshot (Phase-2 preview).
- 24 offline tests; zero native runtime deps; static scan only; scoped + gitignored.
- **Exit criterion**: the gate runs with zero external dependencies and the suite is green. ✅

## Phase 2 — Persistence + incremental maintenance — ✅ SHIPPED
`lib/persist.js` (SQLite via `node:sqlite`, `WITH RECURSIVE` closure, integrityCheck), `lib/ast.js` (tier-2 acorn: calls/refs/inherits, cross-file), `lib/sync.js` (incremental via `git diff`).
- tier-2 tree-sitter extraction: precise `calls` / `references` / `inherits` / `implements` (symbol-level blast radius).
- Normalized SQLite store with content-addressed node IDs, mirrored covering indexes for reverse traversal,
  `WITH RECURSIVE` transitive closure. (JSONL stays as an export/interchange format.)
- Tiered invalidation: `stat` → content hash → `git diff`; VCS-native attribution as the fast path for agent edits.
- Graph versioning, per-edge provenance/timestamp, startup reconciliation, `verify integrity` + clean-rebuild.
- **Exit criterion**: incremental update is sublinear in repo size; a stale-edge-injection suite passes deterministically.

## Phase 3 — Semantic refinement + honesty layer — ✅ SHIPPED
`lib/refine.js` (per-node confidence + change-type risk), `lib/llm-edges.js` (tier-3 merge with evidence validation), `lib/graph.js` (SCC condensation, bounded closure, memoized closure).
- Change-type metadata on the triggering edit (signature / body-only / rename) → discount/amplify the candidate set.
- Provenance per edge (tree-sitter vs LSP vs LLM-inferred) + confidence per reported node.
- tier-3 LLM extraction for implicit edges (DI, events, reflection, dynamic dispatch) — `templates/tier3-extract.md`.
- SCC condensation (collapse cycles), depth-bounded closure with truncation reporting, memoized per-node closure.
- **Exit criterion**: false-alarm rate on the Phase-0 corpus drops by a measured margin; every answer carries honest confidence.

## Phase 4 — Language breadth + hardening — ✅ SHIPPED
Python tier-0 (`lib/extract.js` + `pySpecToRel`), `lib/langs.js` (capability + trust gradient), `lib/security.js` (`execFile` arg-array, `isWithin`), `scripts/verify.mjs` (integrity + `--rebuild`).
- Expand language coverage with per-language capability metadata + graceful degradation (never equal-trust all langs).
- Distribution hygiene: checksummed install, no `curl|sh`/`sudo`, argument-array subprocesses.
- `.trellis/` gitignored by default; no verbatim-source retention; a security review pass.
- **Exit criterion**: a second mature language passes the Phase-0 precision bar; security review clean.

## Phase 5 — PR-level impact — ✅ SHIPPED
`lib/pr.js` (`parseDiff`, `changedSymbols`, `prImpact`) + CLI `pr <root> [--base HEAD]`. Local, privacy-preserving (no third-party LLM egress) — explicitly avoiding the anti-patterns of `blast-radius-analyzer`.

## Non-goals
- Becoming a whole-program dataflow / points-to analyzer (that is the honest answer to "proven breakage"; Trellis
  stays a reachability-based triage tool and points there when proof is required).
- Scraping or executing target code. Static scan only, always.
- An always-on, blocking gate the agent cannot override. The verdict advises; judgment stays with the agent.
