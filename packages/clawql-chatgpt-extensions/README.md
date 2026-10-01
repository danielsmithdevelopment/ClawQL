# clawql-chatgpt-extensions

ChatGPT MCP Extensions for ClawQL 8.0.0 (Spec v0.1).

Wraps [`@openai/mcp-extensions`](https://www.npmjs.com/package/@openai/mcp-extensions) in an Effect Tag + Layer and attaches:

1. Onboarding skill (`skills/setup/SKILL.md`)
2. Composer @-mentions (`clawql_mentions_search`)
3. Mandate approval forms (`openai/elicitation/create`)
4. Structured settings (`clawql_settings_read` / `clawql_settings_update`)
5. Evidence thread tab (`clawql_evidence` → `ui://clawql/evidence`)
6. Console global entrypoint (`clawql_console` → `ui://clawql/console`)
7. File handlers for `.cqe` / `.cqk` (`clawql_open_file`)

## Flag

`CLAWQL_ENABLE_CHATGPT_EXTENSIONS` — default **on**. Set `0` / `false` / `no` to disable.

Capability detection still decides per client: non-ChatGPT clients omit UI-only tools from `tools/list`.

## Docs

See [`docs/design/chatgpt-mcp-extensions-spec.md`](../../docs/design/chatgpt-mcp-extensions-spec.md).
