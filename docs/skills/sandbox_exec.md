# Skill: `sandbox_exec`

Run isolated code in Cloudflare Sandbox via the bridge worker.

## When to Use

- You need quick computation or script checks without local execution.
- You want safer ephemeral execution for generated snippets.
- You need session-based state across related sandbox calls.

## Common Workflow

1. Confirm bridge env is configured.
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
- `sandbox_exec` runs remotely via the bridge worker, not on your local host shell.
