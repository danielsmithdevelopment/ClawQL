---
name: clawql-sandbox-exec
description: Run isolated code snippets via sandbox_exec with safe persistence/session patterns.
---

# ClawQL sandbox_exec workflows

**`CLAWQL_ENABLE_SANDBOX=1`** registers **`sandbox_exec`**. Then **unset** **`CLAWQL_SANDBOX_BACKEND`** = bridge; **`auto`** = **Seatbelt** → **Docker** → **bridge**.

## When to apply

- **`CLAWQL_ENABLE_SANDBOX=1`** is set and you need bridge-only, **`auto`**, or a pinned **`CLAWQL_SANDBOX_BACKEND`**.
- You want session-based state across related sandbox calls.

## Workflow

1. Set **`CLAWQL_SANDBOX_BACKEND`** (omit, **`auto`**, or **`bridge`** / **`macos-seatbelt`** / **`docker`**) and matching env (bridge URL + token, Docker CLI, or macOS **`sandbox-exec`**).
2. Choose `language` and minimal `code`.
3. Use `sessionId` + `persistenceMode: session` for multi-step tasks.
4. Keep `ephemeral` mode for one-off checks.

## Guardrails

- **`bridge`** runs remotely via the Worker; **`macos-seatbelt`** / **`docker`** run locally under Seatbelt or container isolation — not an unconstrained host shell.
- Persist outcomes with **`memory_ingest`** if needed later.
