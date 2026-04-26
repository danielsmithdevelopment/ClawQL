---
name: clawql-sandbox-exec
description: Run isolated code snippets via sandbox_exec with safe persistence/session patterns.
---

# ClawQL sandbox_exec workflows

## When to apply

- You need remote isolated code execution.
- You want quick script checks without local execution.

## Workflow

1. Confirm bridge env is configured.
2. Choose `language` and minimal `code`.
3. Use `sessionId` + `persistenceMode: session` for multi-step tasks.
4. Keep `ephemeral` mode for one-off checks.

## Guardrails

- `sandbox_exec` runs remotely via Cloudflare bridge, not local shell.
- Persist outcomes with `memory_ingest` if needed later.
