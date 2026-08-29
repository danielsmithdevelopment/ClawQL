# clawql-core

Effect-TS foundation for ClawQL modularization ([#307](https://github.com/danielsmithdevelopment/ClawQL/issues/307)). Ground truth: [`docs/design/modularization-implementation-status.md`](../../docs/design/modularization-implementation-status.md).

**Shipped:** `AuditService` + in-process audit ring buffer (MCP `audit` tool delegates here); Merkle + Cuckoo modules; **Plugin / ProviderPlugin architecture (8.0)**; cache helpers.

## Plugin architecture (8.0)

Canonical spec: [`docs/design/clawql-core-plugin-architecture.md`](../../docs/design/clawql-core-plugin-architecture.md)

| Export                                   | Role                                                           |
| ---------------------------------------- | -------------------------------------------------------------- |
| `ProviderPlugin`                         | Installable provider domain (tools, skills, vault-seed, hooks) |
| `StandaloneSkillPlugin`                  | Skills with no owning provider                                 |
| `fireHook`                               | Core hook bus — ATR never-loosen invariant                     |
| `SkillRegistry`                          | Two-tier skill index/content (Skills-over-MCP)                 |
| `defineProviderPlugin` / `installPlugin` | Effect install/uninstall                                       |
| `defineRegisteringProviderPlugin`        | Install-time MCP tool registration (env-gated sets)            |
| `createInMemoryPluginHostServices`       | Shared HookRegistry + install Layer for hosts                  |
| `loadPluginModuleEffect`                 | Dynamic `import()` loader (pairs with optionalDependencies)    |
| `PanguardProviderPlugin`                 | Reference hooks-only provider plugin                           |

**Security:** Hooks may restrict, never loosen ATR — enforced in `fireHook`, not in any provider. Effect types structure errors and DI; they do **not** replace the runtime ATR check.

**Zero-import-if-absent:** `optionalDependencies` + `loadPluginModuleEffect` — not Effect Layers alone.

**Internal modules:** `merkle/`, `cuckoo/`, `plugin/`, `audit/`.

**8.0 hard break:** Phase-2 `Plugin` / `beforeCallTool` and any compatibility bridge are removed — rewrite against `ProviderPlugin`.
