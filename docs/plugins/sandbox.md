---
title: Sandbox
description: sandbox_exec — isolated code snippets via Kata, Docker, Seatbelt, or bridge. Local agent containment via clawql sandbox init.
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

Two layers:

1. **`sandbox_exec` MCP** — isolated code snippets inside the MCP server pipeline
2. **`clawql sandbox`** CLI — macOS Seatbelt containment for **full agent harnesses** (Codex, Claude, Cursor, OpenCode)

## Local agent containment (fail-closed)

Prevent subagent shell incidents (`rm -rf $HOME`, etc.) on developer Macs:

```bash
clawql sandbox init
clawql sandbox verify    # macOS — must pass when failClosed
clawql codex             # launches inside Seatbelt when configured
```

See [Local agent sandbox](/getting-started/local-agent-sandbox) and [ADR 0008](https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/adr/0008-fail-closed-local-agent-sandbox.md).

**Never fail open:** if verification fails, harness launch exits with an error.

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

- [Local agent sandbox](/getting-started/local-agent-sandbox)
- [Sandbox exec walkthrough](/learn/sandbox-exec)
- [MCP tools § sandbox_exec](https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/mcp/mcp-tools.md#sandbox_exec)
