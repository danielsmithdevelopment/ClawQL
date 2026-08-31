# ClawQL 8.0.0 — Plugin Architecture Rewrite (action items)

**Goal:** Ship the final plugin/provider/hook/skill architecture in `clawql-core` so **8.0.0 is the last intentional semver-major for this surface.** Skills discovery (unified `search` + Skills-over-MCP) is **in scope for 8.0.0**, not post-major polish.

**Related:** [Plugin Architecture Spec v0.1](./clawql-core-plugin-architecture.md) · [Migrate to 8.0](../getting-started/migrate-to-8.0.md) · [Plugin model (legacy)](./clawql-plugin-model.md)

**Coordinate with:** PR #982 empty-by-default bundled OpenAPI catalog (related default flip). Architecture + skills + enforcement defaults land in #999; lockstep tag after both merge.

---

## Action item waves

| Wave   | Deliverable                                                                                  | Status                                                      |
| ------ | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| **0**  | Spec v0.1 (+ Effect clarifications, §8 skills)                                               | **Done**                                                    |
| **1**  | `ProviderPlugin` / `StandaloneSkillPlugin` / hooks / skills / vault-seed types               | **Done**                                                    |
| **2**  | `fireHook` ATR never-loosen + WORM events                                                    | **Done**                                                    |
| **3**  | Skill registry + MCP `skills_list` / `skills_get`                                            | **Done**                                                    |
| **4**  | Effect install/uninstall + vault-seed port                                                   | **Done**                                                    |
| **5**  | Hard break: delete Phase-2 `Plugin` / bridge; rewrite in-tree plugins                        | **Done**                                                    |
| **6**  | Dynamic loader + Panguard hooks-only reference                                               | **Done**                                                    |
| **7**  | Horizontal native ProviderPlugin; proxy `fireHook`-only path                                 | **Done**                                                    |
| **7b** | Boot SECURITY WARNING; Panguard opt-in                                                       | **Done**                                                    |
| **8**  | Production dynamic compose; static for tests                                                 | **Done**                                                    |
| **9a** | Migration guide + CHANGELOG hard-break wording                                               | **Done**                                                    |
| **9b** | **Skills in 8.0:** unify SkillRegistry; rank skills in `search`; handoff standalone pack     | **Done** (#999)                                             |
| **9c** | **Vault-seed live:** `MemoryVaultSeedLive` + host wiring when vault configured               | **Done** (#999)                                             |
| **9d** | **Model hooks:** `withModelLifecycleHooks` on inference gateway (`pre-model` / `post-model`) | **Done** (#999)                                             |
| **9e** | Session `session-start` / `session-end` fire points on MCP HTTP transport                    | **Done** (#999)                                             |
| **9f** | ATR-filter provider-bundled skills on search when session ATR available                      | **Done** (#999)                                             |
| **10** | Scenario synthesis (§9 spec) + `parameterNotes` on tools                                     | **`parameterNotes` additive Done**; synthesis **Remaining** |
| **11** | CI green #999 + merge; coordinate #982; tag `v8.0.0`                                         | **Remaining**                                               |

---

## Why 8.0.0 is a major

1. Bundled OpenAPI catalog **default-off** (#982).
2. Enforcement / Panguard **default-off** (`CLAWQL_PANGUARD_PROXY_PLUGIN=1`).
3. Boot **SECURITY WARNING** if no tool-scope enforcement.
4. **Plugin interface hard break** — Phase-2 `Plugin` removed; no bridge.
5. **Skills approach** — two-tier index + unified `search` ranking + standalone packs (handoff default-on) + ATR-filtered provider skills.

### Wave 5 note

No soft landing. `beforeCallTool` callers rewrite to blocking `tool` / `pre-execute` hooks.

---

## Exit criteria

- [x] Stable `clawql-core` plugin exports + docs
- [x] One hook bus (`fireHook`); skill index/fetch; install path
- [x] Legacy bridge **removed** (hard break)
- [x] Production dynamic compose; static for tests
- [x] Migration guide published
- [x] Skills ranked in `search` + shared SkillRegistry + handoff pack (Wave 9b)
- [x] Memory vault-seed live path (Wave 9c)
- [x] Model-scope hooks on inference gateway (Wave 9d)
- [x] Session hooks on MCP HTTP (Wave 9e)
- [x] ATR-filter provider-bundled skills on search (Wave 9f)
- [ ] CI green on #999; merge; coordinate #982; tag `v8.0.0`
