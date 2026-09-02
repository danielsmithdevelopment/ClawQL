# Docs stale audit — 8.0.0 publish cleanup

**Date:** September 2026  
**Scope:** Non-generated docs referencing pre-8.0.0 defaults (opinionated provider stack, Phase-2 `Plugin.onRegister`/`beforeCallTool`, Panguard default-on, lockstep `8.0.0` workspace package versions), plus broken relative links and Streams Lab 5b wording.

## Ground truth (8.0.0)

- Provider catalog is **empty by default** — opt in with `CLAWQL_PROVIDER=default` or Helm `providers.pack: default`; chart default is `providers.pack: none`.
- Plugins are **`ProviderPlugin`** / **`StandaloneSkillPlugin`** only. Phase-2 `Plugin.onRegister` / `beforeCallTool` is **removed** ([#999](https://github.com/danielsmithdevelopment/ClawQL/issues/999)). Current API: `defineRegisteringProviderPlugin` / `tools` / `hooks` / `fireHook`. Migration: [`migrate-to-8.0.md`](../getting-started/migrate-to-8.0.md). Spec: [`clawql-core-plugin-architecture.md`](../design/clawql-core-plugin-architecture.md).
- Panguard enforcement is **opt-in**.
- Workspace `clawql-*` packages are **first publish `0.1.0`**; gateway `clawql-mcp` stays `8.0.0`.
- `mcp-api-adapter` first publish **`0.1.0`**; **7 surfaces** shipped (incl. `/mcp-ui`); QR is the **8th**, planned.
- Streams **Lab 5b shipped**: `streams-slim` in-process; `search`/`execute`/`memory_*` via `fetch(CLAWQL_MCP_URL)`; adapter via `fetch(CLAWQL_MCP_ADAPTER_URL)`; audit LTX. Still deferred: offline Workers-safe `clawql-api` slim.
- `InferenceProviderPlugin.onRegister` is a **different** API — left untouched.

---

## MUST-FIX — applied

| # | File | Fix |
| - | ---- | --- |
| 1 | [`docs/readme/getting-started.md`](../readme/getting-started.md) | Empty-by-default catalog; opt-in run modes; removed `CLAWQL_ENABLE_GOOGLE/AWS` as stack selectors |
| 2 | [`docs/getting-started/agent-setup.md`](../getting-started/agent-setup.md) | Empty-by-default install; copy-paste prompt corrected |
| 3 | [`docs/deployment/clawql-deployment-operations-guide.md`](../deployment/clawql-deployment-operations-guide.md) | Empty catalog + `providers.pack: none` |
| 4 | [`docs/deployment/helm.md`](../deployment/helm.md) | `providers.pack` default `none`; fixed `../charts` → `../../charts` |
| 5 | [`docs/providers/aws-apis-lookup.md`](../providers/aws-apis-lookup.md) | Empty unless opted in |
| 6–7 | Workflows GCP / complex-release | Removed `all-providers` as built-in default; fixed provider README links |
| 8 | [`docs/getting-started/clawql-init-walkthrough-spec.md`](../getting-started/clawql-init-walkthrough-spec.md) | Historical 7.0 banner → migrate-to-8.0 |
| 9 | [`docs/openclaw/clawql-bootstrap.md`](../openclaw/clawql-bootstrap.md) | Empty-by-default catalog |
| 10–13 | [`docs/plugins/*`](../plugins/README.md) | Panguard opt-in; bundled available; ProviderPlugin wording |
| 14 | [`docs/design/clawql-plugin-model.md`](../design/clawql-plugin-model.md) | 8.0 banner + ProviderPlugin current model |
| 15 | [`docs/reference/clawql-plugin-registry.md`](../reference/clawql-plugin-registry.md) | ProviderPlugin rows + checklist |
| 16 | [`docs/vision/clawql-modularization-v2.md`](../vision/clawql-modularization-v2.md) | ProviderPlugin shipped language |
| 17–18 | Streams / DO specs | Lab 5b `fetch()` model (not embedded adapter) |
| 19 | [`docs/README.md`](../README.md) | Adapter `0.1.0` / 7 surfaces; Lab 5b; announcements lead with 8.0.0 |
| 20 | [`docs/design/modularization-implementation-status.md`](../design/modularization-implementation-status.md) | Banner; §11 `0.1.0`; Phase-2 historical |
| 21 | Broken links | `../../providers/README.md` (repo-root `providers/`, not `docs/providers/`) |
| — | [`docs/readme/configuration.md`](../readme/configuration.md) | Internal empty-catalog contradiction |
| — | Contributor tech spec / mcp-tools / gitops / vision roadmap | 8.0 banners + ProviderPlugin / hooks wording |

---

## SHOULD-FIX — deferred

| Item | Notes |
| ---- | ----- |
| Remaining inline historical `onRegister` bullets under banners | Optional polish |
| Contributor §1.1 deep code samples | Banner + Before You Start done; full rewrite later |
| `docs/gtm/mcp-api-adapter-positioning.md` | GTM essay version/surface count |
| `docs/presentations/clawql-slides.md` | Deck auto-load slides |
| `docs/mcp/mcp-tools.md` L7 framing | Partial |
| QR / cellrt surface-count wording in draft specs | Lower risk |
| Harvey LAB / government / surveillance | Intentionally draft |

---

## OK / intentional

- `migrate-to-8.0.md`, `clawql-core-plugin-architecture.md`, `bundled-providers.md`, `panguard-proxy.md`, `configuration.md` (after fix), `clawql-celld.md` Lab 5b
- Historical `announcement-drafts-v7.*`, `release/v7.*-checklist.md`, `vision/archive/*`
- `InferenceProviderPlugin.onRegister`

---

## Release notes refresh (companion)

- `CHANGELOG.md` / `RELEASE_NOTES_v8.0.0.md` / announcement drafts / `v8.0.0-checklist.md` inventory through **#1047** (~1217 commits / ~197 merge PRs) + Streams celld Lab 5b bullets.
- Supersedes stale draft inventory on [#1038](https://github.com/danielsmithdevelopment/ClawQL/pull/1038) (through #1036 only).
