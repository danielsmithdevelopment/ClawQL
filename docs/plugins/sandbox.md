---
title: Sandbox
description: sandbox_exec — isolated code snippets via Kata, Docker, Seatbelt, or bridge. Register with CLAWQL_ENABLE_SANDBOX=1.
slug: sandbox
status: opt-in
package: clawql-sandbox
order: 7
prev: automation
next: ouroboros
---

# Sandbox

**Plugin ID:** `clawql-sandbox`  
**Package:** `packages/clawql-sandbox` — `SandboxPlugin`

Runs untrusted code snippets in an isolated backend without giving agents raw shell on the MCP host.

## MCP tools

| Tool               | Purpose                                                                    |
| ------------------ | -------------------------------------------------------------------------- |
| **`sandbox_exec`** | Execute a code snippet in an isolated environment and return stdout/stderr |

## Enable

| Env                           | Default | Effect                                          |
| ----------------------------- | ------- | ----------------------------------------------- |
| **`CLAWQL_ENABLE_SANDBOX=1`** | off     | Register `SandboxPlugin` and **`sandbox_exec`** |

## Backends (`CLAWQL_SANDBOX_BACKEND`)

| Value                | Typical use                                                     |
| -------------------- | --------------------------------------------------------------- |
| **`kata`**           | Kubernetes Jobs with Kata Containers (production)               |
| **`docker`**         | Docker socket backend (single-node dev)                         |
| **`macos-seatbelt`** | macOS Seatbelt sandbox                                          |
| **`bridge`**         | Cloudflare sandbox bridge (default off-cluster)                 |
| **`auto`**           | Seatbelt → Docker → bridge (or Kata in-cluster when configured) |

Helm: `enableSandbox: true` plus optional `sandboxKata` / `sandboxDocker` blocks.

## Learn more

- [Sandbox exec walkthrough](/learn/sandbox-exec)
- [MCP tools § sandbox_exec](https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/mcp/mcp-tools.md#sandbox_exec)
