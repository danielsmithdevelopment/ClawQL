# ClawQL Modular Architecture — Consolidated Summary (May 2026)

This document is the single source of truth compiling discussions, decisions, refinements, diagram alignment, security considerations, Memory 2.0 details (Daniel Smith), plugin architecture, Helm configuration, extraction strategy, and implementation guidance.

## 1. Core Vision & Feature Tiers Alignment

The architecture defines **three clear tiers**:

- **Always-Enabled** (Core foundation)
- **Default-Enabled (Opt-Out)**
- **Default-Disabled (Opt-In)**

The package structure mirrors this while enabling modularity, minimal dependency bloat, and community extensibility.

## 2. Final Package Ecosystem

| Tier                 | Package Name        | Published | Key Responsibilities                                                                       |
| -------------------- | ------------------- | --------- | ------------------------------------------------------------------------------------------ |
| **Always-Enabled**   | `clawql-core`       | Yes       | Ultra-lightweight primitives: types, ATR claims, base audit, cache, config, security hooks |
| **Always-Enabled**   | `clawql-api`        | **Yes**   | Top-level API tooling: `search()` + `execute()` with **plugin system** for providers       |
| **Default-Enabled**  | `clawql-documents`  | Yes       | Document parsing, cleaning, Presidio redaction, metadata, hierarchy extraction             |
| **Default-Enabled**  | `clawql-memory`     | Yes       | Full Memory 2.0 (Hybrid Vault + Graph + PageIndex)                                         |
| **Default-Enabled**  | `clawql-pageindex`  | Yes       | Vectorless hierarchical tree building & traversal                                          |
| **Default-Disabled** | `clawql-sandbox`    | Yes       | Secure code execution with isolation                                                       |
| **Default-Disabled** | `clawql-ouroboros`  | Yes       | Evolutionary reasoning loops                                                               |
| **Default-Disabled** | `clawql-automation` | Yes       | Scheduling, notifications, HITL                                                            |

**Internal only**:

- `@clawql/merkle` — Tamper-evident roots
- `@clawql/cuckoo` — Deduplication & filters

## 3. `clawql-core` + `clawql-api` Design (Lightweight + Plugins)

**`clawql-core`** is deliberately minimal (no OpenAPI bloat).

**`clawql-api`** is the top-level package for all API interactions, using a **plugin architecture** so users only install what they need.

**Plugin model benefits**:

- Memory-only users install almost nothing extra.
- Community can publish `clawql-api-*` packages.
- Official plugins: `clawql-api-rest`, `clawql-api-openai`, etc.
- Dynamic registration at runtime.

The **plugin interface** allows community contributions with metadata, schemas, and capabilities.

## 4. Memory 2.0 (Full Daniel Smith Refinements)

Includes refined data models (`EntityNode`, `PageIndexTree`, `BFSLayer`, etc.), SQLite schema, hybrid recall algorithm (5-step), vertical RLS at expansion time, pruning policy, Ouroboros/Fabric hooks, Merkle + WORM audit, and failure isolation.

`clawql-memory` depends on `clawql-core`, `clawql-api`, `clawql-documents`, and `clawql-pageindex`.

Backward compatibility via `hybrid.enabled` flag + legacy fallback.

## 5. Security Integration (Defense-in-Depth)

- Merkle roots on every artifact (`@clawql/merkle`)
- ATR claims enforced in `clawql-core` and `clawql-api`
- Presidio redaction in `clawql-documents`
- Kata isolation for heavy workloads (memory ingest, sandbox)
- WORM audit tables
- Vertical RLS + pruning with compliance retention
- All packages inherit the existing Security Guide (add sections for modular layers)

## 6. Updated Helm Values (Illustrative Block)

```yaml
core:
  enabled: true
  logLevel: info

api:
  enabled: true
  plugins:
    rest: true
    openai: true
    graphql: false
  defaultTimeoutMs: 30000
  maxRetries: 3
  audit:
    enabled: true

documents:
  enabled: true
  presidio:
    enabled: true

memory:
  enabled: true
  hybrid:
    enabled: true
    legacyFallback: true
  # ... (full block from detailed Helm design when finalized)

pageindex:
  enabled: true

sandbox:
  enabled: false

ouroboros:
  enabled: false

automation:
  enabled: false

security:
  fullBundle: true
  kata:
    enabled: true
  panguard:
    enabled: true

resources:
  # tier-aware limits as previously detailed
```

## 7. Extraction & Migration Strategy

- **Phase 1**: Create `clawql-core` and `clawql-api` packages.
- **Phase 2**: Move code (primitives → core; search/execute + plugins → api).
- **Phase 3**: Thin wrappers in main ClawQL repo to preserve existing function signatures.
- **Phase 4**: Update `clawql-memory` to use new packages.
- **Phase 5**: Stabilize, flip defaults, publish to npm.

Zero breaking changes during transition.

## 8. Community Plugin Ecosystem

- Clear template repo + contribution guide.
- Plugin validation suite in `clawql-api`.
- Discovery via npm keywords (`clawql-api-plugin`).
- Official curated list in docs.

## 9. Overall Benefits of This Architecture

- **Lightweight**: Memory-only installs stay small.
- **Composable**: Users pick exactly what they need.
- **Extensible**: Community plugins thrive.
- **Secure**: Defense-in-Depth applies uniformly.
- **Production-Ready**: Aligns with Daniel Smith refinements, tier diagram, and Helm config.
- **Future-Proof**: Easy to add more tiers/packages.

## Related repo docs

- [Memory DB hybrid implementation](../memory/memory-db-hybrid-implementation.md)
- [ClawQL security defense in depth](../security/clawql-security-defense-in-depth.md)
- [Helm deployment](../deployment/helm.md)
- [ClawQL ecosystem](../clawql-ecosystem.md)
