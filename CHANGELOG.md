# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/) and the project uses semantic versioning.

## [0.2.0] - 2026-07-08

### Added
- Tier-2 AST extraction via acorn: `calls`, `references`, `inherits`, `instantiates` with cross-file
  resolution through named/default imports.
- SQLite persistence (`node:sqlite`) with `WITH RECURSIVE` transitive closure and an integrity check.
- Incremental sync via `git diff`; security helpers (argument-array exec, path-traversal guard).
- Semantic refinement: per-node confidence + change-type risk ranking; tier-3 LLM-edge merge with
  evidence validation.
- SCC condensation, bounded closure with truncation reporting, memoized reachability.
- Python tier-0 extraction; per-language capability metadata and trust gradient.
- PR-level impact (`pr` command); precision-study harness; `verify` integrity tool.
- CI workflow (lint + tests + smoke on Node 20 and 22).
- End-to-end integration tests.

### Changed
- Refactored extraction around a shared `scan` helper and reachability around a shared `bfs` core (DRY).
- The pre-edit gate emits PASS/WARN/BLOCK with confidence and the `honest` caveat on every result.

### Removed
- Auxiliary design docs (consolidated into `ARCHITECTURE.md` and `RISKS.md`).
- Dead exports: `formatOneLine`, `getNode`, `merge`, `impact`.

## [0.1.0] - 2026-07-08
- Initial release: tier-0/1 extraction, in-memory graph, bidirectional reachability, PASS/WARN/BLOCK gate.
