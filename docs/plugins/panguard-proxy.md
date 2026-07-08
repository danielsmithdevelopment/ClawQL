---
title: Panguard MCP proxy
description: In-process beforeCallTool policy chokepoint for JWT ATR and enterprise MCP defense-in-depth. Default on; disable with CLAWQL_PANGUARD_PROXY_PLUGIN=0.
slug: panguard-proxy
status: default-on
package: clawql-api (PanguardProxyPlugin)
order: 2
prev: core
next: memory
---

# Panguard MCP proxy

**Plugin ID:** `panguard-mcp-proxy`  
**Kind:** `mcp-proxy` (does not register MCP tools)  
**Package:** `clawql-api` — `PanguardProxyPlugin`

The Panguard proxy plugin is the synchronous **`beforeCallTool`** chokepoint for policy enforcement when ClawQL runs behind an enterprise MCP proxy or with in-process ATR rules ([#272](https://github.com/danielsmithdevelopment/ClawQL/issues/272)).

## What it does

- Intercepts every MCP tool call before execution
- Applies JWT ATR / policy decisions (allow, deny, scope checks)
- Does **not** add tools to the MCP surface — it only gates existing ones

## Enable / disable

| Env | Default | Effect |
| --- | ------- | ------ |
| **`CLAWQL_PANGUARD_PROXY_PLUGIN=0`** | on | Omit the proxy plugin from composition |
| **`CLAWQL_PANGUARD_IN_PROCESS=1`** | off | Use in-process policy path (active development) |

## When to use

- Kubernetes deployments with an intercepting MCP proxy
- Defense-in-depth stacks documented in [Defense in depth](/security/defense-in-depth)
- Operators who need a single audit chokepoint before `execute` reaches upstream APIs

## Learn more

- [Defense in depth (site)](/security/defense-in-depth)
- [MCP proxy JWT ATR (repo)](https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/security/mcp-proxy-jwt-atr.md)
- [Plugin registry](/reference/plugins)
