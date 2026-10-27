# ADR 0017: Agent Client Protocol first for runner adapters

- Status: **Accepted**
- Date: 2026-10-27
- Related: [`docs/agents/clawql-agents-spec-v0.1.md`](../agents/clawql-agents-spec-v0.1.md) · [ADR 0015](./0015-program-mode-alongside-search-execute.md) (Ontologiql-shaped open-source vs keep) · [homelab Hermes/Cline ACP](../homelab/personal-agent-hermes-cline.md) · [Buzz / ACP bridge note](../gtm/pragmaticvectors/clawql-buzz-nostr.md) · [Cursor CLI ACP](https://cursor.com/docs/cli/acp) · [Agent Client Protocol](https://agentclientprotocol.com/)

## Naming (do not confuse)

| Abbreviation       | Meaning in this ADR                                                                       | Elsewhere in ClawQL                                                     |
| ------------------ | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| **ACP**            | **Agent Client Protocol** — JSON-RPC between an editor/runner (client) and a coding agent | —                                                                       |
| **ACP (payments)** | Agentic Commerce Protocol checkout sessions                                               | [`clawql-payments` ACP](../payments/clawql-payments.md) — **unrelated** |

In prose, prefer **“Agent Client Protocol”** on first use in a doc, or **“Agent Client Protocol (ACP)”**. Payment checkout stays **“ACP checkout”** / `CLAWQL_ACP_*`.

## Context

`clawql-agents` already ships **native adapters** for seven open-source agents (Phases 1–4). Each new agent that Ontologiql / ClawQL wants to drive tends to need another adapter surface: session start, tool bridge, permission prompts, cancel, resume. That **adapter churn** is a real maintenance and roadmap risk — every protocol drift becomes our bug.

Separately, the industry is standardizing **Agent Client Protocol**: editors/runners speak ACP; agents that implement ACP work with any compatible client (LSP-shaped decoupling). Cursor CLI exposes `agent acp` over stdio JSON-RPC; Cline, Buzz, Zed, and others either speak ACP or sit behind ACP bridges. Homelab docs already prefer **ACP for filesystem/shell** and MCP for ClawQL tools.

Cursor’s **Agent SDK** (`@grok/agent-sdk`, formerly `@cursor/bdk`) is a parallel adoption surface (versioned bots with MCP connections, hooks, evals). It does **not** replace ACP for “drive an arbitrary coding agent”; it is the place ClawQL plugs in as **governance + MCP + audit** for Cursor-built bots ([integration guide](../integrations/cursor-agent-sdk.md)).

## Decision question (one)

**Should Ontologiql’s runner (and ClawQL agent orchestration that drives external coding agents) treat Agent Client Protocol as the primary adapter interface, with native adapters only where ACP cannot express a required capability?**

## Decision

1. **ACP-first.** When an agent (or its harness) supports Agent Client Protocol, the runner **must** prefer an ACP client path over a new bespoke adapter.
2. **Native adapters are the fallback**, not the default growth path. Keep and maintain existing `clawql-agents` adapters. Add a **new** native adapter only when:
   - the agent has no ACP (or ACP-bridge) surface, **or**
   - a required ClawQL capability is missing from ACP (e.g. a permission/mandate binding ACP cannot carry), **and** the gap is documented in the adapter README.
3. **Absorb protocol change in the standard.** Prefer upgrading the shared ACP client (versions, auth methods, permission outcomes) over forking per-agent request shapes.
4. **MCP remains the ClawQL tool plane.** ACP drives the **coding agent session**; ClawQL tools stay on MCP (stdio / Streamable HTTP / gRPC). Do not re-implement `search` / `execute` / mandates as ACP extension methods.
5. **Human approval stays ClawQL’s.** ACP `session/request_permission` (and Cursor extensions like `cursor/create_plan`) are **agent/editor UX**. ClawQL mandates remain **people bound to exact args-hashes** with deterministic policy and WORM — see competitive split in [cursor-agent-sdk.md](../integrations/cursor-agent-sdk.md#competitive-signal).
6. **Ontologiql-shaped split unchanged** ([ADR 0015](./0015-program-mode-alongside-search-execute.md)): publishable runtime/runner bits may speak ACP; **mandates, IFC, risk, audit/WORM stay ClawQL**.

## Non-goals

- Replacing MCP with ACP for ClawQL tool invocation.
- Claiming every agent is ACP-ready today (fallback adapters remain).
- Treating Cursor Approval Bot / owners-policy templates as equivalent to ClawQL mandates.
- Renaming payment **ACP** env vars or packages.

## Consequences

- New agent integrations start with an **ACP spike checklist** (initialize → authenticate → session/new → prompt → permission → cancel) before opening a native-adapter design.
- `docs/agents/` and Ontologiql runner specs should cite this ADR and the naming table above.
- Homelab / Buzz docs that already use Agent Client Protocol are consistent with this decision; align vocabulary (“Agent Client Protocol”) where they still say bare “ACP” next to payments.
- Follow-on landed in-repo: `clawql-agents` `AgentClientProtocol` (stdio NDJSON client + duplex test pair); Agent SDK templates under [`docs/examples/agent-sdk/`](../examples/agent-sdk/) ([integration guide](../integrations/cursor-agent-sdk.md)). Ontologiql runner wiring remains a consumer of that client.

## References

- [Agent Client Protocol](https://agentclientprotocol.com/)
- [Cursor CLI — ACP](https://cursor.com/docs/cli/acp)
- [Cursor Agent SDK](https://cursor.com/docs/agent-sdk) · package `@grok/agent-sdk`
