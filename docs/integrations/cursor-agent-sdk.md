# Cursor Agent SDK × ClawQL

**Status:** Strategy + copy-paste examples + `clawql-agents` mappers/ACP client  
**Package (Cursor):** [`@grok/agent-sdk`](https://www.npmjs.com/package/@grok/agent-sdk) (formerly `@cursor/bdk`)  
**Docs:** [cursor.com/docs/agent-sdk](https://cursor.com/docs/agent-sdk)  
**Examples:** [`docs/examples/agent-sdk/`](../examples/agent-sdk/)  
**Related:** [ADR 0017 — Agent Client Protocol first](../adr/0017-agent-client-protocol-first-adapters.md) · [cursor-vault-memory](./cursor-vault-memory.md) · [agents spec](../agents/clawql-agents-spec-v0.1.md) · [audit / WORM](../security/clawql-audit-standalone.md)

## One-liner

Treat Cursor’s Agent SDK as a **platform to plug into**: ClawQL is the governed MCP connection, optional audit hook, and injection-eval template for bots built on the same harness as Bugbot / Security Review / Approval Bot — not a competing agent host.

## What Agent SDK is (for ClawQL readers)

Agent SDK defines, tests, and deploys **agents as code**: a folder of Markdown + TypeScript with typed tools, skills, **MCP connections**, subagents, channel triggers (GitHub, Slack, …), **hooks**, and **evals**. It runs on Cursor-managed hosting or your infrastructure. The harness powers Cursor’s own review/approval products.

| Slot in an Agent SDK project | ClawQL fit                                                           |
| ---------------------------- | -------------------------------------------------------------------- |
| `mcp-connections/`           | Drop-in ClawQL MCP connection (governed, token-efficient Core tools) |
| `hooks/`                     | Session/event observer → ClawQL tamper-evident audit / WORM          |
| `host-connections/`          | Local / self-hosted ClawQL gateway (host-only MCP tools)             |
| `evals/`                     | Injection-corpus eval template against any Agent SDK bot             |

## 1. Integration opportunity

### `mcp-connections/clawql.ts` (primary distribution)

Cursor developers scaffolding bots are ClawQL’s audience. A **ready-made connection** that points at ClawQL (stdio `bin/clawql-mcp.mjs`, or Streamable HTTP / cloud-agent launcher) should:

- Register Core tools (`search` / `execute` / memory / … per instance tier)
- Document ATR / Panguard / mandate expectations in the connection comments
- Prefer **narrow tool lists** (token efficiency) over dumping every optional toolkit

**Shipped:** copy [`docs/examples/agent-sdk/mcp-connections/clawql.ts`](../examples/agent-sdk/mcp-connections/clawql.ts) into `bot/mcp-connections/clawql.ts`. Streamable HTTP by default (`CLAWQL_MCP_URL`); stdio alternative in-file. Narrow Core `tools` allowlist for token efficiency.

### `hooks/` → ClawQL audit chain

Agent SDK’s example pattern is `hooks/audit.ts` observing session events. Cursor-built bots do not get a **verifiable** record by default.

**Shipped:**

- Copy-paste hook: [`docs/examples/agent-sdk/hooks/clawql-audit.ts`](../examples/agent-sdk/hooks/clawql-audit.ts) → `bot/hooks/clawql-audit.ts` (HTTP `POST /entries` with `ApiKey`)
- Library mapper: `clawql-agents` `agentSdkEventToWormAppend` / `appendAgentSdkHook` / `appendAgentSdkHookHttpEffect`
- When `CLAWQL_AUDIT_REQUIRED=1`, missing config or append failure throws (loud fail — hooks are observe-only and cannot veto turns; still refuse silent drop)

Never treat the hook as a substitute for mandate digests on writes.

### `host-connections/` for self-hosted

For deployments that keep MCP on the host (not Cursor-cloud egress), document wiring a **local ClawQL gateway** as a host connection — same binary/Helm operators already run, with secrets staying on the machine. Use the stdio block in `clawql.ts` or point HTTP at loopback.

### `evals/` — injection corpus as community value

**Shipped:** [`docs/examples/agent-sdk/evals/injection.eval.ts`](../examples/agent-sdk/evals/injection.eval.ts) (+ `evals.config.ts`). Honesty: cite existing boards under `docs/benchmarks/security-suite/` — do not invent AgentDojo claims ([agentready](../proposals/agentready-act-safely.md)). Pair with `clawql security inject` for in-process Panguard drills.

## 2. Adapter shortcut (Ontologiql runner)

Driving **coding agents** (edit/run loops) is a different plane from MCP tools. Prefer **Agent Client Protocol** as the runner’s primary adapter interface; native adapters only when ACP cannot express a required capability. Full decision: **[ADR 0017](../adr/0017-agent-client-protocol-first-adapters.md)**.

**Shipped:** `clawql-agents` `AgentClientProtocol` + `makeAgentClientProtocolLayer` / duplex test pair (`initialize` → `authenticate` → `session/new` → `session/prompt` → permission/update handlers). Stdio NDJSON JSON-RPC aligned with Cursor `agent acp`.

**Runner wiring:** `resolveCodingAgentRoute` / `CodingAgentRunner` / combined **`CodingAgentDrive`** + `prepareCodingAgentStackEffect` (ACP turn or native session + shared WORM). Prefer ACP for `cursor-cli`; catalog agents (`goose`, `cline`, …) stay on native adapters until they expose ACP. See [`docs/agents/ontologiql-runner.md`](../agents/ontologiql-runner.md).

Do **not** confuse Agent Client Protocol with payments **ACP** (`CLAWQL_ACP_*`).

## 3. Competitive signal

Cursor is building toward **agent governance** inside its harness: security-reviewer and owners-policy **templates**, Approval Bot / PR routing, self-hosted machines. That overlaps ClawQL’s direction. The durable differentiation:

| Cursor (harness-native)                                                      | ClawQL                                                                                |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Approvals are often **agents judging changes** (or product-tied review bots) | Approvals are **people** bound to **exact** change digests, with deterministic policy |
| Tied to Cursor’s harness and model routing                                   | Governs **any** agent / model / API as an open MCP + mandate standard                 |
| Session hooks without a compliance-grade chain by default                    | Tamper-evident audit / WORM as a first-class product                                  |

**Posture:** integrate as the governance and audit layer Cursor-built bots plug into — do not race them on “another coding agent.”

## Implementation backlog

| Item                                               | Status                                                                               |
| -------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Docs + ADR 0017                                    | Done                                                                                 |
| Example `mcp-connections/clawql.ts` + README       | Done — [`docs/examples/agent-sdk/`](../examples/agent-sdk/)                          |
| Hook → `clawql-audit` (required = loud fail)       | Done — example + `clawql-agents` mappers                                             |
| Injection eval template                            | Done — `evals/injection.eval.ts` (smoke; not a published board)                      |
| Shared Agent Client Protocol client                | Done — `clawql-agents` `AgentClientProtocol`                                         |
| Ontologiql runner wiring (ACP-first route + spike) | Done — `resolveCodingAgentRoute` / `CodingAgentRunner`                               |
| Combined drive (ACP + native + WORM)               | Done — `CodingAgentDrive` / [`ontologiql-runner.md`](../agents/ontologiql-runner.md) |
| Optional npm pack `@clawql/agent-sdk-*`            | Follow-on if copy-paste friction stays high                                          |
| Host-connection cookbook                           | Follow-on                                                                            |

## See also

- [Cursor vault memory (Cloud Agent)](./cursor-vault-memory.md)
- [MCP tools](../mcp/mcp-tools.md)
- [GTM: agentready act positioning](../gtm/agentready-act-positioning.md)
