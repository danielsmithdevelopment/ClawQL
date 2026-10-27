# Agent SDK × ClawQL examples

Copy-paste snippets for Cursor **Agent SDK** bots (`@grok/agent-sdk`). These are **not** a published npm pack — drop files into an `agent-sdk init` project as named below.

| Path | Copy into Agent SDK project as | Role |
| ---- | ------------------------------ | ---- |
| [`mcp-connections/clawql.ts`](mcp-connections/clawql.ts) | `bot/mcp-connections/clawql.ts` | Governed ClawQL MCP connection (HTTP or stdio) |
| [`hooks/clawql-audit.ts`](hooks/clawql-audit.ts) | `bot/hooks/clawql-audit.ts` | Session/tool events → `clawql-audit` HTTP `/entries` |
| [`evals/injection.eval.ts`](evals/injection.eval.ts) + [`evals/evals.config.ts`](evals/evals.config.ts) | `evals/` | Injection-corpus eval cases (honesty: Panguard gates / planted prompts — not a published AgentDojo claim) |

**Related:** [`docs/integrations/cursor-agent-sdk.md`](../../integrations/cursor-agent-sdk.md) · [ADR 0017](../../adr/0017-agent-client-protocol-first-adapters.md) · mappers in `clawql-agents` (`agentSdkEventToWormAppend`, `AgentClientProtocol`).

## Quick start

1. Scaffold a bot (`npx --yes @grok/agent-sdk@…` / `agent-sdk init`).
2. Copy `mcp-connections/clawql.ts` → `bot/mcp-connections/clawql.ts`.
3. Set secrets as `${NAME}` templates (resolved when the connection opens):
   - HTTP: `CLAWQL_MCP_URL`, optional `CLAWQL_MCP_BEARER`
   - Stdio: path via `CLAWQL_MCP_COMMAND` / args (see file comments)
4. Optional: copy the audit hook; set `CLAWQL_AUDIT_URL` + `CLAWQL_AUDIT_API_KEY`. When `CLAWQL_AUDIT_REQUIRED=1`, append failures throw (loud fail — hooks are observe-only and cannot veto turns; still refuse silent drop).
5. Optional: copy evals; point cases at your bot and run `agent-sdk eval`.

## Token efficiency

Prefer a **narrow** `tools` allowlist (Core: `search`, `execute`, `audit`, `cache` + memory if needed) over advertising every optional ClawQL toolkit. ATR / Panguard / mandates still apply server-side — the connection filter only shrinks what the model sees.
