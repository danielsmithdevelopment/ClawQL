---
title: Panguard MCP proxy
description: Hooks-only ProviderPlugin — blocking tool/pre-execute policy for JWT ATR and enterprise MCP defense-in-depth. 8.0+ opt-in — set CLAWQL_PANGUARD_PROXY_PLUGIN=1.
slug: panguard-proxy
status: opt-in
package: clawql-api (PanguardProxyPlugin)
order: 2
prev: core
next: memory
---

# Panguard MCP proxy

**Plugin ID:** `panguard-mcp-proxy`  
**Shape:** hooks-only `ProviderPlugin` (does not register MCP tools)  
**Package:** `clawql-api` — `createPanguardProxyPlugin`

The Panguard proxy plugin registers a blocking **`tool` / `pre-execute`** hook for policy enforcement when ClawQL runs behind an enterprise MCP proxy or with in-process ATR rules ([#272](https://github.com/danielsmithdevelopment/ClawQL/issues/272)). `McpProxyPipeline` fires hooks via `fireHook` (ATR never-loosen).

**8.0+:** enforcement providers are **default-off**. A bare install has no tool-scope enforcement until you opt in. Boot emits a **SECURITY WARNING** when none is active (silence with `CLAWQL_ALLOW_NO_ENFORCEMENT=1` only if intentional).

## What it does

- Intercepts every MCP tool call before execution (blocking `pre-execute`)
- Applies JWT ATR / policy decisions (allow, deny, scope checks)
- Does **not** add tools to the MCP surface — it only gates existing ones

## Enable / disable

| Env                                  | Default | Effect                                             |
| ------------------------------------ | ------- | -------------------------------------------------- |
| **`CLAWQL_PANGUARD_PROXY_PLUGIN=1`** | off     | Register the proxy plugin in composition           |
| **`CLAWQL_PANGUARD_IN_PROCESS=1`**   | off     | Active in-process policy path (blocking hooks)     |
| **`CLAWQL_ALLOW_NO_ENFORCEMENT=1`**  | off     | Silence boot warning when no enforcement is active |

## When to use

- Kubernetes deployments with an intercepting MCP proxy
- Defense-in-depth stacks documented in [Defense in depth](/security/defense-in-depth)
- Operators who need a single audit chokepoint before `execute` reaches upstream APIs

## Learn more

- [Defense in depth (site)](/security/defense-in-depth)
- [MCP proxy JWT ATR (repo)](https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/security/mcp-proxy-jwt-atr.md)
- [Plugin registry](/plugins)
- [Migrate to 8.0](../getting-started/migrate-to-8.0.md)
