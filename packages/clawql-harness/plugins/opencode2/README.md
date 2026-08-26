# OpenCode2 harness plugin

Optional embed bridge for `@opencode-ai/sdk`. Registers harness tool `opencode2_session` (not MCP unless bridged).

## Behavior

1. On setup, dynamically imports `@opencode-ai/sdk/v2` (or package root) and calls `createOpencode`.
2. `opencode2_session` runs `session.create` + `session.prompt` with WORM events.
3. Teardown closes the embedded server.
4. Without the peer SDK, the tool returns a structured error (use `clawql opencode` CLI instead).

## Env (session config — not enable flags)

| Var | Purpose |
| --- | --- |
| `CLAWQL_OPENCODE_HOSTNAME` | Bind host (default `127.0.0.1`) |
| `CLAWQL_OPENCODE_PORT` | Bind port (`0` = ephemeral) |
| `CLAWQL_OPENCODE_PROVIDER_ID` + `CLAWQL_OPENCODE_MODEL_ID` | Optional model for prompt |
| `CLAWQL_OPENCODE_AGENT` | Optional agent name |

## Install peer

```bash
npm install @opencode-ai/sdk
```
