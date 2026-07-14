---
title: HITL (Label Studio)
description: hitl_enqueue_label_studio and webhook path for human-in-the-loop review. CLAWQL_ENABLE_HITL_LABEL_STUDIO=1.
slug: hitl-label-studio
status: shipped
package: src/
order: 11
prev: payments
next: third-party
---

# HITL (Label Studio)

**Plugin ID:** `clawql-hitl-label-studio` (in-process; full `Plugin.onRegister` wiring planned)  
**Status:** MCP tool + webhook **shipped** — see the operator guide below

Human-in-the-loop review via [Label Studio](https://labelstud.io/) task import and webhook callbacks ([#228](https://github.com/danielsmithdevelopment/ClawQL/issues/228)).

## Enable

| Env                                     | Effect                                |
| --------------------------------------- | ------------------------------------- |
| **`CLAWQL_ENABLE_HITL_LABEL_STUDIO=1`** | Register tool + webhook route         |
| **`CLAWQL_LABEL_STUDIO_URL`**           | Label Studio base URL                 |
| **`CLAWQL_LABEL_STUDIO_API_TOKEN`**     | API token                             |
| **`CLAWQL_HITL_WEBHOOK_TOKEN`**         | Webhook auth (required in production) |

## Operator guide (canonical)

Full architecture, security, RBAC, Helm, and OpenClaw integration:

- **[HITL — Label Studio bridge (MCP)](../mcp/hitl-label-studio.md)** — operator walkthrough
- **[HITL on docs.clawql.com](/hitl-label-studio)** — website overview
- **[HITL & human interfaces](/reference/hitl)** — reference hub

## MCP tool

| Tool                            | Purpose                       |
| ------------------------------- | ----------------------------- |
| **`hitl_enqueue_label_studio`** | Import tasks for human review |
