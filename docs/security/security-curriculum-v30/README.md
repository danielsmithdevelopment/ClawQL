# 30-module security curriculum sources

Markdown bodies + manifest that generate [`../security-best-practices-series/`](../security-best-practices-series/README.md). This is not MCP tooling; site route `/tools` is the MCP tool catalog.

## Layout

| Path | Purpose |
| ---- | ------- |
| `manifest.json` | Titles, slugs, tags, `part` / `description` |
| `bodies/NN.md` | Module body (no frontmatter) |
| `extract-bodies-from-monolith.mjs` | Split `docs/security/archive/security-guide-series.md` narratives into `bodies/` |
| `build-modules.mjs` | Write `docs/security/security-best-practices-series/NN-<slug>.md` |

## Workflow

After editing the monolith or individual bodies:

```bash
node docs/security/security-curriculum-v30/extract-bodies-from-monolith.mjs   # optional: refresh bodies from monolith
node docs/security/security-curriculum-v30/build-modules.mjs
cd apps/docs && node scripts/sync-security-training-modules.mjs
```

Website routes: `/security/best-practices/<slug>`.
