# ClawQL 8.0.0 — Plugin Architecture Rewrite (action items)

**Goal:** Ship the final plugin/provider/hook/skill architecture in `clawql-core` so **8.0.0 is the last intentional semver-major for this surface.** After this, new capabilities extend the same contracts — they do not invent parallel ones.

**Related:** [Plugin Architecture Spec v0.1](./clawql-core-plugin-architecture.md) · [Plugin model (Phase 2, legacy)](./clawql-plugin-model.md) · [Modularization status](./modularization-implementation-status.md)

**Does not replace:** PR #982 empty-by-default bundled OpenAPI catalog is a _related_ 8.0 breaking default; this rewrite is the _identity_ change. Both belong under 8.0.0; merge order: architecture contracts first (or lockstep), then release-prep tagging.

---

## Action item waves

| Wave   | Deliverable                                                                                                                                                                                                     | Breaking?        | Status                                                                                        |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | --------------------------------------------------------------------------------------------- |
| **0**  | Spec v0.1 landed (`clawql-core-plugin-architecture.md`) incl. §8 skills + Effect clarifications                                                                                                                 | Docs             | **Done**                                                                                      |
| **1**  | Types in `clawql-core`: `ProviderPlugin`, `StandaloneSkillPlugin`, `LifecycleHook`, `Skill*`, `VaultSeedEntry`                                                                                                  | API surface      | **Done**                                                                                      |
| **2**  | `fireHook` Effect runtime: ATR never-loosen + `HOOK_SCOPE_VIOLATION_BLOCKED` / `HOOK_TRIGGERED`                                                                                                                 | Runtime contract | **Done**                                                                                      |
| **3**  | Two-tier skill index/fetch + `skills/list` / `skills/get` registry APIs                                                                                                                                         | New MCP surface  | **Done** (registry; MCP RPC wiring follow-on)                                                 |
| **4**  | `PluginInstaller` Effect: install/uninstall, tagged vault-seed ports, WORM config events                                                                                                                        | Runtime          | **Done**                                                                                      |
| **5**  | Compat: legacy `Plugin` / `beforeCallTool` → `ProviderPlugin` + `tool`/`pre-execute` hook                                                                                                                       | Migration        | **Done** (`legacyPluginToProviderPlugin`)                                                     |
| **6**  | Dynamic loader (`optionalDependencies` + `import()`); Panguard as hooks-only provider plugin                                                                                                                    | Composition      | **Done** (loader + reference plugin; api composition follow-on)                               |
| **7**  | Migrate horizontal packages (memory, documents, …) onto `ProviderPlugin.install`                                                                                                                                | Package APIs     | **In progress** — proxy pipeline accepts HookRegistry + `fireHook`; full package migrate next |
| **7b** | **Boot SECURITY WARNING when zero tool-scope enforcement is active** (generic — not Panguard-by-name); `CLAWQL_ALLOW_NO_ENFORCEMENT=1` to silence; Panguard proxy **opt-in** (`CLAWQL_PANGUARD_PROXY_PLUGIN=1`) | Security default | **Done**                                                                                      |
| **8**  | Composition root: replace static imports in `compose-horizontal-plugin-layers.ts`                                                                                                                               | Boot path        | **Partial** — `compose-horizontal-plugin-layers-dynamic.ts` added (opt-in); cutover next      |
| **9**  | CHANGELOG `[8.0.0]` — **loudest line = default-off providers + default-off enforcement**; migration guide; version lockstep; CI green; tag                                                                      | Release          | After waves 7–8                                                                               |

---

## Why 8.0.0 is a major (behavior, not just API)

The ProviderPlugin refactor is largely backward-compatible via the Wave 5 bridge. **8.0.0 is still a major** because of deliberate default flips:

1. **Bundled OpenAPI provider catalog: default-on → default-off** (operators opt in via `providers.pack` / `CLAWQL_PROVIDER`) — PR #982.
2. **Enforcement / Panguard: default-on → default-off** — `CLAWQL_PANGUARD_PROXY_PLUGIN=1` to register; `CLAWQL_PANGUARD_IN_PROCESS=1` for active gating. Passive registration alone is not enforcement.
3. **Boot SECURITY WARNING** when zero tool-scope enforcement is active (Wave **7b**) — same class of misconfiguration warning as audit-off / shared-key warnings. Generic (any blocking `beforeCallTool` / `pre-execute` counts); not Panguard-by-name. Silence only with `CLAWQL_ALLOW_NO_ENFORCEMENT=1`.

These are the loudest CHANGELOG lines — architecture notes secondary.

### Wave 5 care note (`beforeCallTool` → `pre-execute`)

Legacy `beforeCallTool` was already **awaited** by `McpProxyPipeline` (fail-closed). The bridge maps it to `blocking: true` tool/`pre-execute`, which matches. Do **not** treat the bridge as allowing non-blocking enforcement — anything enforcement-shaped must remain awaited (§5.3).

---

## Non-negotiables (must not regress)

1. Hooks may **restrict**, never **loosen** ATR — enforced in `fireHook`, not in any provider.
2. No quiet hook path — every fire → WORM (`HOOK_TRIGGERED` or `HOOK_SCOPE_VIOLATION_BLOCKED`).
3. Install/uninstall fully reversible (tools, skills, vault-seed tags, hooks).
4. Effect types `install` / `uninstall` / `handler`; security invariants remain **runtime** checks.
5. Zero-cost absence = `optionalDependencies` + dynamic `import()`, **not** Effect Layers alone.
6. `clawql-core` has **no** hard dependency on Panguard.

---

## Naming disambiguation (freeze now)

| Term                          | Meaning in 8.0+                                                           |
| ----------------------------- | ------------------------------------------------------------------------- |
| **Plugin**                    | Any installable unit (`ProviderPlugin` or `StandaloneSkillPlugin`)        |
| **Provider**                  | External domain (GitHub, WebMCP source, documents, …)                     |
| **Provider plugin**           | Installable artifact for a provider domain                                |
| **Bundled OpenAPI provider**  | On-disk specs under `providers/` — **not** a ProviderPlugin               |
| **Inference provider plugin** | `clawql-inference` LLM adapters — **separate namespace**; do not overload |

---

## Exit criteria for “never break again”

- Public exports of `clawql-core` plugin APIs are stable and documented.
- One hook bus; one skill index; one install path.
- Legacy `Plugin` is `@deprecated` with a one-release (or same-major) bridge, then removed only if unused — preferably bridge stays thin forever rather than a second major.
- Horizontal packages and Panguard consume the new contracts; static composition imports are gone.
