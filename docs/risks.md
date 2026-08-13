# Trellis — Risks

> The single most important thing about this project is a premise the graph never validates.

## #1 — Load-bearing, unproven: dependency edges ≠ impact  (EXISTENTIAL)

A static typed dependency graph yields a **syntactic reachability set, not a breakage set.** The two diverge exactly
on the edits that matter:

- **Signature-preserving semantic changes** (e.g. `getUser()` now also revokes tokens, signature unchanged) →
  **zero new edges → the real blast radius is invisible.** (false negative)
- **Rename of a private helper** → the graph lights up everywhere → **false alarm.** (false positive)
- **Over-approximation by construction**: `A→B→C`, change C's internals → A is "in the blast radius" but may never
  touch the changed surface.

If unmitigated, Trellis cries wolf until the user disables it, and the graph becomes dead weight.

**Mitigation (shipped now, partial):**
- The verdict is framed as **triage, not proof**; every result carries the `honest` caveat.
- **change-type** (`body-only`/`signature`/`rename`/`add`/`delete`) discounts body-only changes and amplifies
  signature changes (see `lib/gate.js`).
- **Absence-of-edges caveat**: on a tier-0-only graph, a 0-blast verdict explicitly warns it is *not* proof.

**Mitigation (deferred, Phase 0 + 3):**
- A **precision study** (Phase 0): measure recall/precision of the reachability set against a corpus of real edits
  *including the adversarial cases* before investing in infrastructure.
- A **semantic-refinement layer** (Phase 3): change-type metadata attached to the triggering edit; provenance
  (acorn vs LSP vs LLM) + confidence on every reported node; SCC condensation + depth-bounded closure.

## #2 — Freshness / correctness drift (a single stale edge silently corrupts everything)
Incremental update (Phase 2) is the linchpin and the fragility: one stale edge makes every downstream answer wrong,
and the error is **invisible** (queries still return plausible sets).

**Mitigation**: MVP builds fresh in-memory every run (no staleness). Phase 2 adds a graph version, per-edge
provenance/timestamp, a startup reconciliation pass, a `changed`/dangling check, and a clean-rebuild escape hatch.

## #3 — Over-engineering vs. the minimal counterweight
The full stack (acorn + LSP + SQLite + content-addressing + tiered invalidation + recursive closure) is a large
surface for a skill whose job is "don't edit blind." `@vk0/code-impact-mcp` (zero-database, PASS/WARN/BLOCK) is a
legitimate challenge: the median case may not need it.

**Mitigation**: build minimal first (this release). Persistence/incremental are Phase-2 optimizations justified by
scale, not Phase-1 requirements. The Phase-0 study decides whether the heavy layers ever earn their keep.

## #4 — Language-coverage inconsistency (structural, not incidental)
AST grammar maturity is bimodal (acorn covers JS/TS; tree-sitter is the planned multi-language path); resolution
(`sys.path`, bundler aliases, autoloading, dynamic dispatch) is where "full blast radius" lives or dies — and it is
invisible to tier 0–2. MVP is JS/TS + Python tier-0.

**Mitigation**: per-language capability metadata (Phase 4); never present all languages as equally trustworthy;
graceful degradation, not silent omission.

## #5 — Supply-chain & data-handling
Trellis reads an entire private codebase; the persisted graph is a compact map of its structure.

**Mitigation**: zero native runtime deps; static scan only (never `marshal`-deserialize bytecode, never execute
target code); scoped to the project boundary; `.trellis/` gitignored; no verbatim source beyond what edges require;
subprocess calls use argument arrays, never `shell=True` (when added).

## #6 — The "cascade of what must be updated" overclaim
A graph can say an importer *might* need to change, not that it *must*, and cannot sequence the work.

**Mitigation**: the output is a **candidate set with confidence**, never a mandated, ordered task list. Necessity
and ordering belong to the agent and the user, not the graph.
