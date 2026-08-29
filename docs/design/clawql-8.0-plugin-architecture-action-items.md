# ClawQL 8.0.0 — Plugin Architecture Rewrite (action items)

**Goal:** Ship the final plugin/provider/hook/skill architecture in `clawql-core` so **8.0.0 is the last intentional semver-major for this surface.**

**Related:** [Plugin Architecture Spec v0.1](./clawql-core-plugin-architecture.md) · [Migrate to 8.0](../getting-started/migrate-to-8.0.md) · [Plugin model (legacy)](./clawql-plugin-model.md)

**Coordinate with:** PR #982 empty-by-default bundled OpenAPI catalog (related default flip). Architecture + enforcement defaults land in #999; lockstep tag after both merge.

---

## Action item waves

| Wave   | Deliverable                                                                                                        | Status                             |
| ------ | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------- |
| **0**  | Spec v0.1 (+ Effect clarifications, §8 skills)                                                                     | **Done**                           |
| **1**  | `ProviderPlugin` / `StandaloneSkillPlugin` / hooks / skills / vault-seed types                                     | **Done**                           |
| **2**  | `fireHook` ATR never-loosen + WORM events                                                                          | **Done**                           |
| **3**  | Skill registry + MCP `skills_list` / `skills_get`                                                                  | **Done**                           |
| **4**  | Effect install/uninstall + vault-seed port                                                                         | **Done**                           |
| **5**  | ~~Legacy bridge~~ → **Hard break:** delete `Plugin` / `beforeCallTool` / bridge; rewrite all in-tree plugins       | **Done**                           |
| **6**  | Dynamic loader + Panguard hooks-only reference                                                                     | **Done**                           |
| **7**  | Horizontal native ProviderPlugin (all packages); proxy `fireHook`-only path                                        | **Done**                           |
| **7b** | Boot SECURITY WARNING when zero enforcement; Panguard opt-in                                                       | **Done**                           |
| **8**  | Production boot uses dynamic compose (`ensureClawqlApi` / `createRegisteredMcpServerAsync`); static kept for tests | **Done**                           |
| **9**  | Migration guide + CHANGELOG loud defaults + hard-break wording; tag after CI green + #982                          | **Docs done** — tag on release day |

---

## Why 8.0.0 is a major

1. Bundled OpenAPI catalog **default-off** (#982).
2. Enforcement / Panguard **default-off** (`CLAWQL_PANGUARD_PROXY_PLUGIN=1`).
3. Boot **SECURITY WARNING** if no tool-scope enforcement (`CLAWQL_ALLOW_NO_ENFORCEMENT=1` to silence).
4. **Plugin interface hard break** — Phase-2 `Plugin` removed; no compatibility bridge.

### Wave 5 note

No soft landing. `beforeCallTool` callers rewrite to blocking `tool` / `pre-execute` hooks.
---

## Exit criteria

- [x] Stable `clawql-core` plugin exports + docs
- [x] One hook bus (`fireHook`); skill index/fetch; install path
- [x] Legacy bridge retained
- [x] Production dynamic compose; static for tests
- [x] Migration guide published
- [ ] CI green on #999; merge; coordinate #982; tag `v8.0.0`
