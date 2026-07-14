# ClawQL plugins (docs site source)

Canonical markdown for the **Plugins** section on [docs.clawql.com/plugins](https://docs.clawql.com/plugins).

Each `*.md` file (except this README) syncs to `website/src/generated/clawql-plugins/` via:

```bash
cd website && node scripts/sync-clawql-plugin-pages.mjs
```

## Pages

| File                   | Site route                   | Status                      |
| ---------------------- | ---------------------------- | --------------------------- |
| `core.md`              | `/plugins/core`              | Always on                   |
| `panguard-proxy.md`    | `/plugins/panguard-proxy`    | Default on                  |
| `memory.md`            | `/plugins/memory`            | Default on                  |
| `codegraph.md`         | `/plugins/codegraph`         | Opt in                      |
| `documents.md`         | `/plugins/documents`         | Default on                  |
| `bundled-providers.md` | `/plugins/bundled-providers` | Default install stack       |
| `automation.md`        | `/plugins/automation`        | Opt in                      |
| `sandbox.md`           | `/plugins/sandbox`           | Opt in                      |
| `ouroboros.md`         | `/plugins/ouroboros`         | Opt in                      |
| `payments.md`          | `/plugins/payments`          | Shipped (`clawql-payments`) |
| `hitl-label-studio.md` | `/plugins/hitl-label-studio` | Planned                     |
| `third-party.md`       | `/plugins/third-party`       | Roadmap                     |

Living registry (tables, composition): [../reference/clawql-plugin-registry.md](../reference/clawql-plugin-registry.md) → `/reference/plugins`.
