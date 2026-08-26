# OpenCode2 harness plugin

Optional embed bridge for `@opencode-ai/sdk` + the `opencode` CLI (`opencode-ai`).
Registers harness tool `opencode2_session` (not MCP unless bridged).

## Behavior

1. On setup, dynamically imports `@opencode-ai/sdk/v2` (or package root); does **not** spawn yet.
2. On first `opencode2_session`, ensures `opencode-ai` `bin/` is on `PATH` and calls `createOpencode`.
3. Runs `session.create` + `session.prompt` (v2 flat params: `sessionID`, `parts`, …) with WORM events.
4. Defaults to free OpenCode model `opencode/big-pickle` (no API keys required for demos).
5. Teardown closes the embedded server.
6. Without peers (or when embed fails), the tool returns a structured error (use `clawql opencode` CLI instead).

## Install peers

```bash
npm install @opencode-ai/sdk opencode-ai
```

## Env (session config — not enable flags)

| Var | Purpose |
| --- | --- |
| `CLAWQL_OPENCODE_HOSTNAME` | Bind host (default `127.0.0.1`) |
| `CLAWQL_OPENCODE_PORT` | Bind port (`0` / unset = SDK default) |
| `CLAWQL_OPENCODE_TIMEOUT_MS` | Server start timeout (default `20000`) |
| `CLAWQL_OPENCODE_PROVIDER_ID` | Model provider (default `opencode`) |
| `CLAWQL_OPENCODE_MODEL_ID` | Model id (default `big-pickle`) |
| `CLAWQL_OPENCODE_AGENT` | Optional agent name |
| `CLAWQL_OPENCODE_DISABLE_EMBED=1` | Skip embed (unit tests / force CLI path) |

## Demo

```bash
# from repo root, with peers installed
node --input-type=module <<'EOF'
import { Effect } from "effect";
import { ClawQLHarness, invokeHarnessTool } from "clawql-harness";
import { OpenCode2Plugin } from "clawql-harness/plugins/opencode2";

const harness = await Effect.runPromise(
  ClawQLHarness.create({ plugins: [OpenCode2Plugin], model: { provider: "stub", name: "demo" } })
);
const out = await Effect.runPromise(
  invokeHarnessTool(harness.state, "opencode2_session", {
    task: "Reply with exactly: OPENCODE_CLAWQL_OK",
  }).pipe(Effect.provide(harness.layer))
);
console.log(out);
await Effect.runPromise(harness.teardown());
process.exit(0);
EOF
```
