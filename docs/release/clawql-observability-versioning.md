# clawql-observability — versioning and release cadence

**Package:** `packages/clawql-observability/`  
**npm name:** `clawql-observability`  
**Status:** First publish **`0.1.0`** (September 2026) — not previously on the registry

---

## Summary

| Concept                            | Meaning                                                                                                |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------ |
| **npm semver**                     | Public releases: `0.1.0`, `0.1.1`, `0.2.0`, … — independent of `clawql-mcp`                            |
| **Development phase**              | Internal delivery label (Phase 1, 2, 3a–3d, 4, 4b, 5) — **not** an npm version bump                    |
| **In-tree `0.7.0` (historical)**   | Temporary workspace version tracking phase progress before first publish — **never shipped to npm**    |
| **Draft `0.2.0` in release notes** | Early v8.0 prep assumed Phase 1+2 would publish first — superseded by single **`0.1.0`** first release |

---

## Why `0.1.0` and not `0.7.0`?

`npm view clawql-observability` returns **404** — there is no published history. Semver for a first public release should start at **`0.1.0`** (initial development release per [semver.org](https://semver.org/#spec-item-4)) rather than implying six prior releases.

During monorepo development the package `version` field was bumped to **`0.7.0`** to mirror **implementation phase** progress (Phase 4/5 landing). That was a **workspace convenience**, not a statement that `0.1.0` through `0.6.0` existed on npm.

**Decision (2026-09-01):** Reset to **`0.1.0`** for the first registry publish. All features through Phase 5 ship in that single initial release.

---

## Development phases vs npm versions

Phases are documented in:

- [`packages/clawql-observability/README.md`](../../packages/clawql-observability/README.md)
- [`docs/design/clawql-observability-package-spec.md`](../design/clawql-observability-package-spec.md)
- [`docs/design/clawql-observability-provider-registry.md`](../design/clawql-observability-provider-registry.md)

| Phase  | Scope (shipped in **0.1.0**)                           |
| ------ | ------------------------------------------------------ |
| **1**  | LGTM+ compose, Alloy OTLP, Helm values, CI smoke       |
| **2**  | Faro JWT Worker proxy, backend token mint              |
| **3a** | Provider registry skeleton, built-in LGTM+ adapters    |
| **3b** | Alloy config generator from registry snapshot          |
| **3c** | Query federation (LogQL / PromQL / TraceQL / profiles) |
| **3d** | Host MCP tools + HTTP routes + WORM bridge             |
| **4**  | Langfuse OTLP export, Panguard deny telemetry          |
| **4b** | Falco / Tetragon / Wazuh → Loki, correlation dashboard |
| **5**  | Alerting catalog, Vault/env JWT keys, Alloy reload     |

**Future npm bumps** follow semver on **user-visible breaking or additive changes**, not automatic “one phase = one minor” mapping. Example: a breaking change to `ObservabilityQueryService` APIs might warrant `0.2.0` even if no new “phase” is declared.

---

## Relationship to `clawql-mcp@8.0.0`

- **`clawql-mcp`** (root) uses lockstep **8.0.0** for the Agentic Gateway major line.
- **`clawql-observability`** publishes on its **own 0.x cadence** — listed in [`scripts/release/npm-publish-order.json`](../../scripts/release/npm-publish-order.json) **before** `clawql-mcp` so workspace `workspace:*` resolves to concrete versions in the published tarball.
- Host wiring (`CLAWQL_ENABLE_OBSERVABILITY`, dynamic horizontal layers) lives in the root package; the observability **library** is consumable standalone via npm.

---

## Where versions are defined

| Location                                     | Role                                                          |
| -------------------------------------------- | ------------------------------------------------------------- |
| `packages/clawql-observability/package.json` | **Source of truth** for npm version                           |
| Root `package.json` / `package-lock.json`    | Workspace dependency pin                                      |
| `packages/clawql-observability/CHANGELOG.md` | Package-level release notes                                   |
| Root `CHANGELOG.md`                          | Monorepo narrative (links here for cadence)                   |
| `RELEASE_NOTES_v8.0.0.md`                    | Gateway major release; observability row must match **0.1.0** |

---

## Publish order

From [`scripts/release/npm-publish-order.json`](../../scripts/release/npm-publish-order.json):

1. Publish `clawql-api`, `clawql-audit`, `clawql-core` (and upstream deps) first.
2. Publish **`clawql-observability`** before **`clawql-mcp`**.
3. Full monorepo tag (`v8.0.0`) may still gate on OIDC; observability can also ship via the same npm publish workflow when the tag includes the updated package version.

See **[`clawql-observability-0.1.0-checklist.md`](./clawql-observability-0.1.0-checklist.md)** for first-publish steps.

---

## Migration notes for monorepo contributors

If you have a local branch that still references `clawql-observability@0.7.0`:

```bash
# After pulling main with the 0.1.0 reset:
npm install
grep clawql-observability package.json packages/clawql-observability/package.json
# Expect 0.1.0 in both workspace pin and package version
```

No runtime API renames — this is a **version label correction** only.

---

## Related

- Package README: [`packages/clawql-observability/README.md`](../../packages/clawql-observability/README.md)
- Public docs: [docs.clawql.com/observability](https://docs.clawql.com/observability)
- First publish checklist: [`clawql-observability-0.1.0-checklist.md`](./clawql-observability-0.1.0-checklist.md)
