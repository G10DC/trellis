# Prism Unified Code Analysis Suite

Prism is the master code-analysis engine of the G10DC ecosystem. It unifies 11 specialized static analysis capabilities under a single coherent domain model:

- `prism ast` (`trellis` & `smith`): Bidirectional AST dependency graphs, `.ast-cache.json` single-pass caching, and safe codemods.
- `prism search` (`prism-search`): Hybrid AST + Vector RAG search with Reciprocal Rank Fusion.
- `prism review` (`mirror`): Pre-commit security, correctness, and maintainability reviewer.
- `prism history` (`archaeologist`): Git commit churn, line survival curves, and temporal coupling analyzer.
- `prism deadcode` (`tombstone`): Unreachable symbol and asset bloat hunter.
- `prism audit` (`lookout`): CVE dependency vulnerability and license auditor.
- `prism summarize` (`hydra`): Hierarchical map-reduce codebase architecture summarizer.
- `prism diagram` (`cartographer`): Automatic Mermaid architecture diagram renderer.
- `prism lineage` (`schema-lineage`): SQL migration parser and ERD data lineage mapper.
- `prism score` (`pulse`): Composite project health & code quality score synthesizer (0-10).

## Module Synergy
```
                        [ Source Code & Git History ]
                                     │
                 ┌───────────────────┴───────────────────┐
                 ▼                                       ▼
        [ AST & Cache Engine ]                 [ Git Churn & Metrics ]
         (trellis / smith)                     (archaeologist / hydra)
                 │                                       │
                 ├───────────────────┬───────────────────┤
                 ▼                   ▼                   ▼
          [ Search Engine ]   [ Dead Code / Audit ]  [ Diagram / Lineage ]
           (prism-search)    (tombstone/lookout)    (cartographer/schema)
                 │                   │                   │
                 └───────────────────┼───────────────────┘
                                     ▼
                            [ Quality Score ]
                                 (pulse)
```
