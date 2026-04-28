# Skill: `sandbox_exec`

**`CLAWQL_ENABLE_SANDBOX=1`** registers the MCP tool (diagram **default off — opt in**). Then: **unset** **`CLAWQL_SANDBOX_BACKEND`** = **bridge**; **`auto`** = **Seatbelt** → **Docker** → **bridge**; or pin **`bridge`**, **`macos-seatbelt`**, **`docker`** ([#207](https://github.com/danielsmithdevelopment/ClawQL/issues/207)).

## When to Use

- You need local isolation without Cloudflare: **Seatbelt** on macOS or **`docker`** / **`podman`** on Linux/Mac (OrbStack, Docker Desktop).
- You want safer ephemeral execution for generated snippets.
- You need session-based state across related sandbox calls.

## Common Workflow

1. Confirm backend: omit for bridge, **`auto`** for cascade, or pin **`CLAWQL_SANDBOX_BACKEND`**; configure URL + token / Docker / **`sandbox-exec`** as needed.
2. Choose `language` (`python`, `javascript`, `shell`).
3. Send small, focused `code`.
4. Reuse `sessionId` for multi-step runs.
5. Use `persistenceMode` and `timeoutMs` intentionally.

## Patterns

### Pattern A: One-off verification

- `persistenceMode: ephemeral`
- single call, single output

### Pattern B: Multi-step scratch session

- fixed `sessionId`
- `persistenceMode: session`
- write file in step 1, reuse in step 2

### Pattern C: Operational script test

- run shell/python snippet to validate logic before porting to production workflow

## Tips

- Keep snippets minimal; avoid long-running tasks.
- Treat output as untrusted until validated.
- Pair with `memory_ingest` if results should be durable.
- **`bridge`** runs remotely via the Worker. **`macos-seatbelt`** / **`docker`** run locally under Seatbelt or container isolation — still not an unconstrained host shell.
