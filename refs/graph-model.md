# Graph model

## Nodes
```
{ id, kind, file, line, exported, labels? }
```
- `kind` ∈ `file` | `symbol` | `external` | `entrypoint`
- `id` conventions:
  - file → project-relative posix path, e.g. `src/auth.js`
  - symbol → `file::Name`, e.g. `src/auth.js::validateToken`
  - external → `external:<pkg>`, e.g. `external:express`
- `labels` is an open set for coverage seeding (e.g. `['exported']`, `['file']`, `['external']`).

## Edges
```
{ from, to, type, tier, inferred, evidence? }
```
- `type` ∈ `defines` | `imports` | `calls` | `references` | `inherits` | `implements` | `instantiates` | `tests` |
  `registered` | `handles`
- `tier`: 0 regex · 1 manifest · 2 tree-sitter · 3 LLM-inferred · 4 MCP-resolved
- `inferred`: true when the edge is by-convention / not statically provable (mandatory for tier 3)
- `evidence`: `file:line` (+ a short note) — **mandatory unless inferred**; the gate and the audit cite it

## MVP edge inventory (tiers 0–1)
| type | from → to | tier | source |
|---|---|---|---|
| `defines` | file → symbol | 0 | regex `function\|class\|const\|let\|var NAME` |
| `imports` | file → file | 0 | regex `import … from 'rel'` / `require('rel')` (relative spec resolved) |
| `imports` | file → `external:<pkg>` | 1 | bare import spec + manifest |

## Deferred (Phases 2–3)
| type | tier | note |
|---|---|---|
| `calls` / `references` | 2 | tree-sitter; needed for symbol-level blast radius |
| `inherits` / `implements` / `instantiates` | 2 | tree-sitter |
| `tests` | 2/3 | test → symbol |
| `registered` / `handles` | 3 | LLM: DI, event handlers, routes, dynamic dispatch |

## Reachability semantics
- `blastRadius(X)` = reverse BFS = **who depends on X** (what a change to X can break downstream).
- `cascade(X)` = forward BFS = **what X depends on** (what an edit must stay consistent with).
- The two sets are usually disjoint and serve different decisions; `impact` returns both.
- Edge-type filters narrow the set (e.g. structural `inherits`/`implements` only for a hard-breakage view).
