# 30-module security curriculum build

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
node tools/security-curriculum-v30/extract-bodies-from-monolith.mjs   # optional: refresh bodies from monolith
node tools/security-curriculum-v30/build-modules.mjs
cd website && node scripts/sync-security-training-modules.mjs
```

Website routes: `/security/best-practices/<slug>`.
