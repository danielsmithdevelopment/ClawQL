# Cursor Agent SDK × ClawQL

**Status:** Strategy + integration map (templates not yet published as an npm pack)  
**Package (Cursor):** [`@grok/agent-sdk`](https://www.npmjs.com/package/@grok/agent-sdk) (formerly `@cursor/bdk`)  
**Docs:** [cursor.com/docs/agent-sdk](https://cursor.com/docs/agent-sdk)  
**Related:** [ADR 0017 — Agent Client Protocol first](../adr/0017-agent-client-protocol-first-adapters.md) · [cursor-vault-memory](./cursor-vault-memory.md) · [agents spec](../agents/clawql-agents-spec-v0.1.md) · [audit / WORM](../security/clawql-audit-standalone.md)

## One-liner

Treat Cursor’s Agent SDK as a **platform to plug into**: ClawQL is the governed MCP connection, optional audit hook, and injection-eval template for bots built on the same harness as Bugbot / Security Review / Approval Bot — not a competing agent host.

## What Agent SDK is (for ClawQL readers)

Agent SDK defines, tests, and deploys **agents as code**: a folder of Markdown + TypeScript with typed tools, skills, **MCP connections**, subagents, channel triggers (GitHub, Slack, …), **hooks**, and **evals**. It runs on Cursor-managed hosting or your infrastructure. The harness powers Cursor’s own review/approval products.

| Slot in an Agent SDK project | ClawQL fit |
| ---------------------------- | ---------- |
| `mcp-connections/` | Drop-in ClawQL MCP connection (governed, token-efficient Core tools) |
| `hooks/` | Session/event observer → ClawQL tamper-evident audit / WORM |
| `host-connections/` | Local / self-hosted ClawQL gateway (host-only MCP tools) |
| `evals/` | Injection-corpus eval template against any Agent SDK bot |

## 1. Integration opportunity

### `mcp-connections/clawql.ts` (primary distribution)

Cursor developers scaffolding bots are ClawQL’s audience. A **ready-made connection** that points at ClawQL (stdio `bin/clawql-mcp.mjs`, or Streamable HTTP / cloud-agent launcher) should:

- Register Core tools (`search` / `execute` / memory / … per instance tier)
- Document ATR / Panguard / mandate expectations in the connection comments
- Prefer **narrow tool lists** (token efficiency) over dumping every optional toolkit

**Ship shape (follow-on):** example under `docs/examples/agent-sdk/` or a small `@clawql/agent-sdk-connection` snippet in docs — one file copy into `mcp-connections/`.

### `hooks/` → ClawQL audit chain

Agent SDK’s example pattern is `hooks/audit.ts` observing session events. Cursor-built bots do not get a **verifiable** record by default. A ClawQL hook package should:

- Map session lifecycle + tool-call events into `clawql-audit` / WORM (or `audit` MCP buffer only for ephemeral debug — not compliance-grade alone)
- Never treat the hook as a substitute for mandate digests on writes

### `host-connections/` for self-hosted

For deployments that keep MCP on the host (not Cursor-cloud egress), document wiring a **local ClawQL gateway** as a host connection — same binary/Helm operators already run, with secrets staying on the machine.

### `evals/` — injection corpus as community value

Publish an eval template that runs ClawQL’s **injection / AgentDojo-adjacent** corpus against an Agent SDK bot. That is useful to their community and keeps ClawQL’s security work visible. Honesty: cite existing boards under `docs/benchmarks/security-suite/` — do not invent AgentDojo claims ([agentready](../proposals/agentready-act-safely.md)).

## 2. Adapter shortcut (Ontologiql runner)

Driving **coding agents** (edit/run loops) is a different plane from MCP tools. Prefer **Agent Client Protocol** as the runner’s primary adapter interface; native adapters only when ACP cannot express a required capability. Full decision: **[ADR 0017](../adr/0017-agent-client-protocol-first-adapters.md)**.

Do **not** confuse Agent Client Protocol with payments **ACP** (`CLAWQL_ACP_*`).

## 3. Competitive signal

Cursor is building toward **agent governance** inside its harness: security-reviewer and owners-policy **templates**, Approval Bot / PR routing, self-hosted machines. That overlaps ClawQL’s direction. The durable differentiation:

| Cursor (harness-native) | ClawQL |
| ----------------------- | ------ |
| Approvals are often **agents judging changes** (or product-tied review bots) | Approvals are **people** bound to **exact** change digests, with deterministic policy |
| Tied to Cursor’s harness and model routing | Governs **any** agent / model / API as an open MCP + mandate standard |
| Session hooks without a compliance-grade chain by default | Tamper-evident audit / WORM as a first-class product |

**Posture:** integrate as the governance and audit layer Cursor-built bots plug into — do not race them on “another coding agent.”

## Implementation backlog (suggested order)

1. **Docs + ADR** (this page + ADR 0017) — done in-repo.
2. **Example `mcp-connections/clawql.ts`** + README for `agent-sdk init` consumers.
3. **Hook sketch** mapping Agent SDK session events → `clawql-audit` (fail-closed if WORM unavailable when mandated).
4. **Eval template** packaging a subset of injection fixtures for Agent SDK `evals/`.
5. **Shared Agent Client Protocol client** for Ontologiql / runner (after ADR 0017 checklist).

## See also

- [Cursor vault memory (Cloud Agent)](./cursor-vault-memory.md)
- [MCP tools](../mcp/mcp-tools.md)
- [GTM: agentready act positioning](../gtm/agentready-act-positioning.md)
