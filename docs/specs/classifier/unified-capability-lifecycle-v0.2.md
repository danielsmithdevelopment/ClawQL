---
title: "The Unified Capability Lifecycle: Fast-Path Match, Sandboxed Exploration, Gated Promotion"
status: "September 2026 — mostly consolidates existing specs; Section 3.5 introduces a new, required clawql-core contract"
version: "0.2"
package: "packages/clawql-core/classifier/ + packages/clawql-core/capability-lifecycle/ + packages/clawql-sandbox/ + packages/clawql-harness/plugins/ouroboros/ + clawql-audit"
---

# The Unified Capability Lifecycle v0.2

**In-repo home** for the consolidation + §3.5 three-bucket `execute()` contract.

## Implementation map

| Concern                                | Path                                                                                                           |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Spec (this page)                       | `docs/specs/classifier/unified-capability-lifecycle-v0.2.md`                                                   |
| Session catalog (bucket 1) + rebind    | `packages/clawql-core/src/capability-lifecycle/session-catalog.ts`                                             |
| Promotion store (bucket 3)             | `packages/clawql-core/src/capability-lifecycle/promotion-store.ts`                                             |
| Execute reachability allow-rule        | `packages/clawql-core/src/capability-lifecycle/execute-reachability.ts`                                        |
| Register-side port (§3.5.1)            | `packages/clawql-core/.../register-intercept.ts` + `packages/clawql-harness/src/capability-register-wiring.ts` |
| Blocking `pre-execute` hook            | `packages/clawql-core/src/capability-lifecycle/hook.ts`                                                        |
| Fast-path → slow-path orchestration    | `packages/clawql-core/src/capability-lifecycle/lifecycle.ts`                                                   |
| Fast Decision / skill fast-path        | `packages/clawql-core/src/classifier/`                                                                         |
| Sandbox (bucket 2 host for novel code) | `packages/clawql-sandbox/` (ADR 0011)                                                                          |

## §3.5 Three buckets (new clawql-core contract)

1. **Session catalog** — tools bound at session start ⊆ ATR `S`; frozen unless explicit rebind (§3.5.2).
2. **Sandboxed novel code** — may _run_ in `clawql-sandbox`; nested `execute()` still hits bucket 1 or 3 only (no fourth identity).
3. **Gated skill** — `PROMOTION_ACCEPTED` with `validatedScope ⊆ S`.

Nothing else is `execute`-reachable. Denials write `CAPABILITY_WRITE_INTERCEPTED` with `intercept_kind` + `disposition`.

## Allow-rule (two real branches)

```
ALLOW iff tool ∈ session_catalog ∩ S
       OR (PROMOTION_ACCEPTED ∧ validatedScope ⊆ S)
ELSE DENY + CAPABILITY_WRITE_INTERCEPTED
```

## Five-step test honesty

- Steps 1–4 (invoke): covered by `capability-lifecycle.test.ts`.
- MCP path: **default-on** unless `CLAWQL_CAPABILITY_LIFECYCLE=0`. Blocking `pre-execute` plugin on `McpProxyPipeline` (`capability-lifecycle-plugin.test.ts`). Catalog is lazily seeded from ATR tokens, `CLAWQL_CAPABILITY_SESSION_SEED`, or `DEFAULT_CAPABILITY_SESSION_SEED` (`catalog-bootstrap.ts`); hosts may still call `bindSessionCatalog` explicitly. Opt out with `=0`.
- Step 5 (register-side before harness treats tool as live): **wired** in `clawql-harness` via `ctx.tools.register` → `CapabilityRegisterIntercept` when `enableCapabilityRegisterIntercept: true` or `CLAWQL_HARNESS_CAPABILITY_REGISTER=1` (independent of `CLAWQL_CAPABILITY_LIFECYCLE`, the MCP pre-execute gate). Default wiring shares `getCapabilityLifecycleRuntime().catalogLayer`. On enable, empty sessions are seeded from `atrScope.toolsInScope`; tools outside that set are not added to the live tool map (`routed_to_sandbox` → `blockedRegistrations`).

## Implementation status (honest)

| Claim                                         | Status                                                                                            |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Pure allow-rule + WORM shapes                 | Implemented                                                                                       |
| Accept-time promotion ⊆ S                     | Implemented                                                                                       |
| Harness cannot set disposition / sandbox fork | Implemented (core policy)                                                                         |
| Default MCP execute gate                      | **Default-on** (opt out `CLAWQL_CAPABILITY_LIFECYCLE=0`); lazy catalog bootstrap                  |
| Register-side step 5                          | Wired in `clawql-harness` (opt-in via `CLAWQL_HARNESS_CAPABILITY_REGISTER` / config; not MCP env) |

## Related

- Fast Decision Primitive: [`fast-decision-primitive-v0.4.md`](./fast-decision-primitive-v0.4.md)
- Isolation ADR 0011: [`../../adr/0011-isolation-agent-substrate-sandbox-celld.md`](../../adr/0011-isolation-agent-substrate-sandbox-celld.md)

_Unified Capability Lifecycle · v0.2 · September 2026_
