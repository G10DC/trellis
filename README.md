# Trellis

See the lattice before you cut. Trellis builds a dependency graph you consult *before* editing, so no link breaks unseen.

## Golden Rules
1. **Consult before you cut**: Run `impact` before editing any shared symbol.
2. **Reachability ≠ Breakage**: The graph lists who *could* be touched, not who *will* break.
3. **Single-Pass AST Caching**: Generates `.ast-cache.json` for zero-redundancy consumption by `smith` and `prism-search`.

## Testing
```bash
node --test test/*.test.js
```
