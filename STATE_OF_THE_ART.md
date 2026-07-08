# Trellis — State of the Art

The references surveyed during design divide into *renderers* (produce a picture and stop) and *analyzers* (attempt
impact reasoning). None validates the edges-≈-impact assumption; that gap is Trellis's `RISKS.md` #1.

## Reference repos
| repo | what it is | take / borrow | avoid |
|---|---|---|---|
| `colbymchenry/codegraph` | local MCP code-graph, `.codegraph/` per project, auto-sync | the commercial analogue; "fewer tokens / tool calls, 100% local" framing | `curl\|sh` / `irm\|iex` from mutable `main`; opaque self-bundled runtime |
| `Deep3939/blast-radius` | blast radius for AWS infra | **the invariant**: "the AI cannot hallucinate blast radius — it can only reason over what the graph already proved" (graph-first, LLM-second) | — |
| `thebjorn/pydeps` | Python import visualizer | static-scan discipline (never executes target code) | file/module-only granularity; unsafe `marshal` of `.pyc` |
| `jmarkowski/codeviz` | C/C++ `#include` → Graphviz | stdlib-only, zero-transitive-dep posture | one-shot, stateless, no persistence/query |
| `amitgambhir/blast-radius-analyzer` | POC on a hand-authored JSON graph | the risk-severity + confidence *framing* | unauthenticated `/analyze`; crown-jewel egress to third-party LLMs; 0★ POC — do not treat as architecture input |

## npm (inspiration)
- `@kodus/kodus-graph`, `@sdsrs/code-graph` — parse source → structural graph, call-graph traversal, route tracing. Candidate reference implementations for the AST→graph transform (Phase 2).
- `kirograph` — local semantic knowledge graph, "fewer tool calls, instant symbol lookup". Closest to the value prop.
- `dependency-graph` — minimal, dependency-free graph with cycle detection. Adequate for prototyping the reachability layer in JS/TS (Trellis rolls its own pure core instead, for control of tiers/provenance).
- `@vk0/code-impact-mcp` — **philosophical counterweight**: a zero-database, pre-commit PASS/WARN/BLOCK gate in seconds. It challenges the heavy SQLite-plus-incremental design and motivates "build minimal first" (`ROADMAP.md` Phase 1 → 2).

## HN (market signal)
- `Depwire` — "dependency graph and MCP tools so AI stops refactoring blind" (the pitch in five words).
- `enola-labs/enola` — "deterministic architecture graph for developers and AI agents".
- Signal: "MCP server + code graph" is a crowded category → differentiation must come from **correctness, incremental
  warmth, and the pre-edit gate**, not from "we also have a graph".

## Academic
A literature search surfaced topical false positives ("blast" = physical explosion: burr analysis, blast loading
on composite hulls, laminated glass). Not prior art. The real foundations are **incremental program analysis,
points-to analysis, and change-impact analysis** in software engineering — consult separately for the formal
reachability-vs-impact distinction that underpins `RISKS.md`.

## How Trellis differs
- **Native skill** (markdown + stdlib scripts), not an external MCP server / RAG — though it can *consume* a code-graph
  MCP as tier 4 if present, and degrade gracefully to grep/tree-sitter.
- **The honesty layer**: change-type + provenance + confidence + caveat on every answer — the feature the reference
  field lacks and that `RISKS.md` #1 demands.
- **The pre-edit gate** as a first-class protocol (consult before cut), not a visualization.
