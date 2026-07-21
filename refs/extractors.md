# Extractor recipes

## tier 0 — regex (shipped, JS/TS family)
Defined in `lib/extract.js`:

```js
import: /import\s+(?:([\w$]+)\s*,?\s*)?(?:\{([^}]*)\})?\s*(?:,\s*\*\s*as\s+([\w$]+))?\s*from\s*['"]([^'"]+)['"]|require\s*\(\s*['"]([^'"]+)['"]\s*\)/g
def:     /(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:function|class|const|let|var)\s+([A-Za-z_$][\w$]*)/g
```
- Relative specs (`./`, `../`) are resolved to a project-relative path (no FS, no extension inference — a known
  limitation: `import './auth'` won't match `src/auth.js`; use `./auth.js` or add an extension-aware resolver in Phase 2).
- Bare specs (`express`, `@scope/pkg/sub`) are collected as `unresolved` and later wired to `external:<top>` via the manifest.
- `exported` is detected by `^export\b` at the match start.

### Adding a language (tier 0)
1. Add extensions to `LANG_BY_EXT` in `extract.js`.
2. Provide `import` and `def` regexes for that language (Python `import`/`from … import`, Go `import`, Rust `use`, …).
3. Add a dispatch in `extractFile` keyed by `lang`.
4. Add a fixture + a unit test that asserts a resolved import edge and an unresolved bare import.

## tier 1 — manifest (shipped)
`extractManifest(pkg)` merges `dependencies`/`devDependencies`/`peerDependencies`/`optionalDependencies` into
`externals`, and flattens `main`/`module`/`types`/`bin`/`exports` into `entrypoints`. Other ecosystems: `go.mod`,
`Cargo.toml`, `requirements.txt`/`pyproject.toml` — same shape, add a parser per Phase 4.

## tier 2 — acorn AST (shipped, JS/TS)
Precise `calls` / `references` / `inherits` / `implements` / `instantiates`, with cross-file resolution through
named/default imports (`lib/ast.js`). Acorn is a pure-JS ESTree parser (zero native deps).
- Error-recovery on broken input can produce structurally-valid garbage edges — the worst failure mode for an impact
  tool (`RISKS.md` #2); `extractModule` returns `parseError: true` and degrades gracefully.
- Deep extraction is lazy where possible; tier-2 edges are preferred over tier-0 for the same pair when both exist.
- tree-sitter remains the planned multi-language backend (Phase 4) for languages acorn does not cover.

## tier 3 — processing engine-inferred (Phase 3, see `templates/tier3-extract.md`)
For implicit edges (DI registration, event listeners, dynamic dispatch, reflection). The processing engine returns JSON edges with
**mandatory `evidence`**; `inferred: true`; the gate lowers confidence when these are in the blast.

## tier 4 — MCP code-graph (optional)
If a code-graph MCP server is configured (e.g. `codegraph`, `@sdsrs/code-graph`), consume it as the highest-trust
source and skip tiers 0–3 for the languages it covers. Trellis still owns the gate and the honesty layer.
