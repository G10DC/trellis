---
name: trellis
description: Build a lightweight dependency graph of a codebase (tier-0 imports + tier-1 manifests + tier-2 acorn AST for symbol-level calls) and consult its bidirectional reachability BEFORE editing, so no dependent is missed. Returns a PASS/WARN/BLOCK verdict with confidence and change-type, never claiming reachability equals breakage. Graph-first, LLM-second — the model reasons over proven edges, never invents them. Use proactively before non-trivial edits on medium/large JS/TS codebases, and whenever a change touches shared or exported symbols.
---

# Trellis

See the lattice before you cut. Trellis builds a dependency graph you consult *before* editing, so no link breaks
unseen. One rule above all: **reachability is a candidate set, not a proven breakage set — never edit a shared
symbol without consulting its blast radius, and never trust the graph as proof of safety.**

## Golden rules
1. **Consult before you cut.** Run `impact` before editing any non-trivial or shared symbol. After the edit is too late.
2. **Reachability ≠ breakage.** The graph lists who *could* be touched, not who *will* break. Signature-preserving
   semantic changes are invisible; renames over-report. Treat the verdict as triage, not proof.
3. **Graph-first, LLM-second.** The model reasons over edges the extractor *proved*; it never invents edges or
   impact sets.
4. **Read the confidence.** tier-0/1 edges are syntactic; tier-3 edges are LLM-inferred and lower trust. Absence
   of edges is not absence of dependents.
5. **Act on the verdict, don't just collect it.** WARN/BLOCK ⇒ open the dependents and decide. PASS on a tier-0-only
   graph ⇒ still verify manually; the graph is incomplete.
6. **Minimal by default.** In-memory, one language family, zero native deps. Persistence and multi-language are
   Phase 2+.

## The pre-edit gate (the whole point)
```
about to edit X
   │
   ▼
build graph (in-memory) ──► blast radius (who depends on X) ──► verdict
                            update cascade (what X depends on)   PASS / WARN / BLOCK + confidence
   │                                                                   │
   ▼                                                                   ▼
 consult dependents  ◄────────────────────────────────────  reason over proven output
```
A `BLOCK` is a strong suggestion to look before cutting — never a hard stop the agent cannot override with judgment.

## Commands (`scripts/cli.mjs`)
- `impact <root> <node> [--depth N] [--change body-only|signature|rename|add|delete] [--full]` — build, compute
  blast+cascade, emit the verdict. The main command.
- `index <root> [--out]` — build + stats; with `--out`, persist a snapshot to `<root>/.trellis/graph.jsonl`.
- `locate <root> "<query>"` — find nodes by name, show their blast size (graph-guided localization).
- `changed <root>` — dangling edges vs a prior snapshot (post-edit hygiene).
- `audit` — print the adversarial dependency-audit prompt; run it before committing (the "did I miss a dependency?" gate).
- `pr <root> [--base HEAD]` — parse `git diff`, compute what could break and what to test (local, privacy-preserving).
- `verify <root> [--rebuild]` (via `scripts/verify.mjs`) — integrity check (dangling edges) + clean rebuild.

Auxiliary scripts: `scripts/precision-study.mjs` (Phase 0 de-risk metrics). `lib/sync.js` `syncToSQLite` for incremental sync.

## Edge tiers & confidence
`0` regex (imports) · `1` manifest (externals) · `2` acorn/AST — calls/refs/inheritance, cross-file ✅ · `3` LLM-inferred
(DI/events/reflection) ✅ via `lib/llm-edges.js` · `4` MCP-resolved (optional). Edges carry `tier` + `inferred`;
the gate (`lib/gate.js`) + `lib/refine.js` lower confidence when inferred edges are in the blast.

## When NOT to use
- Trivial edits (typo, comment, single-line tweak in an unexported helper).
- Codebases below ~20 files — a `Grep` is cheaper than a graph.
- When you need *proven* breakage, not candidates — Trellis will not give you that (`RISKS.md`); reach for real
  type/dataflow analysis instead.

## Tools (reason with these)
- `lib/graph.js` — `blastRadius` / `cascade` / `impact` / `dangling` / `reachability` (pure, depth + edge-type filters).
- `lib/extract.js` — `extractFile` / `extractManifest` / `buildGraph` (tiered; DI for offline tests).
- `lib/gate.js` — `gate` / `classifyChange` (PASS/WARN/BLOCK + confidence + change-type).
- `lib/format.js` — `formatBrief` / `formatFull` (compact, labeled output).
- `templates/adversarial-audit.md` — devil's-advocate prompt (find the missed dependency).
- `RISKS.md` — the load-bearing assumption and how it's mitigated (read once).
- `refs/` — graph model, extractor recipes, impact algorithm, honesty layer.

## Status
Phases 0–5 complete (71 offline tests): tier-0/1/2 extraction (regex + manifest + acorn AST, JS/TS + Python),
in-memory graph + SQLite persistence (`WITH RECURSIVE`), bidirectional reachability with depth/type filters,
SCC condensation, bounded closure, memoized closure, PASS/WARN/BLOCK gate with confidence + change-type,
semantic refinement, tier-3 LLM-edge merge, incremental sync via `git diff`, integrity check + rebuild,
precision-study harness, PR-level impact. Graph-first/LLM-second; honest (reachability ≠ breakage).
