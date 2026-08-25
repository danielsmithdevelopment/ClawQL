# OpenCode2 harness plugin

Optional embed bridge for `@opencode-ai/sdk`. Installs as a harness plugin only; does not register MCP tools unless explicitly bridged.

When the SDK peer is absent, `opencode2_session` returns a structured stub error so operators can use `clawql opencode` CLI harness instead.
