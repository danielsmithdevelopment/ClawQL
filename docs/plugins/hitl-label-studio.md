---
title: HITL (Label Studio)
description: hitl_enqueue_label_studio and webhook path for human-in-the-loop review. Planned plugin wiring; CLAWQL_ENABLE_HITL_LABEL_STUDIO=1.
slug: hitl-label-studio
status: planned
package: src/ (planned clawql-automation or standalone)
order: 9
prev: ouroboros
next: third-party
---

# HITL (Label Studio)

**Plugin ID:** `clawql-hitl-label-studio` (planned)  
**Status:** Logic exists in `src/`; full `Plugin.onRegister` wiring is **planned**

Human-in-the-loop review via [Label Studio](https://labelstud.io/) task import and webhook callbacks ([#228](https://github.com/danielsmithdevelopment/ClawQL/issues/228)).

## MCP tools (target)

| Tool                            | Purpose                       |
| ------------------------------- | ----------------------------- |
| **`hitl_enqueue_label_studio`** | Import tasks for human review |

## Enable (today)

| Env                                     | Effect                                |
| --------------------------------------- | ------------------------------------- |
| **`CLAWQL_ENABLE_HITL_LABEL_STUDIO=1`** | Register tool + webhook route         |
| **`CLAWQL_LABEL_STUDIO_URL`**           | Label Studio base URL                 |
| **`CLAWQL_LABEL_STUDIO_API_TOKEN`**     | API token                             |
| **`CLAWQL_HITL_WEBHOOK_TOKEN`**         | Webhook auth (required in production) |

## Learn more

- [HITL & human interfaces](/reference/hitl)
- [HITL Label Studio](/hitl-label-studio)
- [hitl-label-studio.md](https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/mcp/hitl-label-studio.md)
