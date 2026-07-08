# Trellis — project rules (drop-in)

When working in this repo:

- **Graph-first, LLM-second.** The model reasons over edges the extractor proved; it never invents edges or impact
  sets. If an edge has no `evidence`, it must be `inferred: true` and carry a tier ≥ 3.
- **Reachability ≠ breakage.** Never phrase a verdict as "this will break." It is a candidate set; always emit the
  `honest` caveat. Signature-preserving semantic changes are invisible; renames over-report.
- **Pure core, I/O at the edges.** `lib/graph.js` and `lib/gate.js` stay I/O-free and unit-testable. Inject
  `readFile`/`listFiles` into `buildGraph` for tests; never mock ESM.
- **Every edge has a tier.** 0 regex · 1 manifest · 2 tree-sitter · 3 LLM-inferred · 4 MCP. The gate uses tiers for
  confidence. MVP ships 0–1 only; do not add 2/3 without the matching `refs/` notes and tests.
- **Minimal by default.** Persistence, incremental sync, multi-language, and tree-sitter are Phase 2+ and must earn
  their keep (see `ROADMAP.md`). Do not add a dependency for something the stdlib can do.
- **Static scan only.** Never `require`/`import`/`marshal`-deserialize target code to analyze it. Scoped to the
  project boundary; `.trellis/` is gitignored.
- **Test it.** `npm test` must stay green. New behavior in `lib/` gets a unit test; new CLI path gets a smoke check.
- **Measure before optimizing**: if you change extraction or the gate, run the suite and a
  smoke `impact` on `test/fixtures/sample` before and after.
