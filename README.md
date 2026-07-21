# Trellis

> See the lattice before you cut.

A Agent skill that builds a **dependency graph** of a codebase and answers **"what breaks if I change this?"**
*before* you edit — so no dependent is missed on medium/large codebases.

Trellis is **graph-first, processing engine-second**: the model reasons over edges the extractor *proved*; it never invents edges
or impact sets. And it is **honest**: it never claims its reachability set is a proven breakage set (the trap every
existing tool in this space falls into — see `RISKS.md`).

## What it does
- Builds an in-memory graph (tier-0 regex imports + tier-1 manifests; JS/TS family).
- Computes **bidirectional reachability**: *blast radius* (who depends on me → what I might break) and *update
  cascade* (what I depend on → what I must stay consistent with).
- Emits a **PASS / WARN / BLOCK** verdict with **confidence** and **change-type** (body-only / signature / rename /
  add / delete) — a triage signal, not a proof.
- Ships a **devil's-advocate audit** prompt to actively hunt for missed dependencies before committing.

## Quick start
```bash
node scripts/cli.mjs impact <project-root> src/auth.js --change signature --full
node scripts/cli.mjs index <project-root> --out       # build + persist snapshot
node scripts/cli.mjs locate <project-root> "validate" # graph-guided localization
node scripts/cli.mjs pr <project-root>                # what to test / what could break from git diff
node scripts/verify.mjs <project-root>                # integrity check (+ --rebuild)
node scripts/precision-study.mjs                      # Phase 0 de-risk metrics
node scripts/cli.mjs audit                            # pre-commit adversarial audit prompt
npm test                                              # 71 offline tests
```

Example output:
```
WARN · blast=2 cascade=2 change=signature confidence=high

Top dependents at risk (nearest first):
  [d1] src/api.js  (imports, tier 0)
  [d2] src/index.js  (imports, tier 0)
· signature change directly risks 2 dependents
honest: Reachability is a CANDIDATE set, not a proven breakage set. ...
```

## Why "Trellis"
A trellis is a lattice that makes the links between branches visible — you inspect it before pruning so you don't
sever the wrong bond. A hand-tool metaphor for a coding craft.

## Roadmap (abbreviated)
- **Phase 0** ✅ — precision study (de-risk): reach recall 1.0, 1 adversarial false negative.
- **Phase 1** ✅ — minimal graph-first skill: in-memory, tier-0/1, gate.
- **Phase 2** ✅ — acorn AST calls (symbol-level) + SQLite persistence + incremental sync.
- **Phase 3** ✅ — semantic refinement: change-type, provenance, processing engine implicit edges (tier 3), confidence.
- **Phase 4** ✅ — Python + security hardening + verify; PR-level impact.

See `ARCHITECTURE.md` and `RISKS.md`.

## Origin
The honesty layer and the Phase-0-first roadmap follow from the core limitation: a static graph proves reachability,
not breakage. See `RISKS.md` for the load-bearing assumption.
