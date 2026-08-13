# Trellis

See the lattice before you cut. Trellis builds a dependency graph you consult *before* editing, so no link breaks unseen.

## Golden Rules
1. **Consult before you cut**: Run `impact` before editing any shared symbol.
2. **Reachability ≠ Breakage**: The graph lists who *could* be touched, not who *will* break.
3. **Snapshot for hygiene**: `index --out` writes `.trellis/graph.jsonl`, consumed by trellis's own `changed` command — not shared with `smith` or `prism-search`.

## Testing
```bash
node --test "test/**/*.test.{js,mjs,cjs}" "tests/**/*.test.{js,mjs,cjs}"
```
