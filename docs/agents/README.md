# Agents + ClawQL

Open-source agents are **not** built in this repository. These docs describe how ClawQL wraps them (Panguard, WORM, vault, inference) versus the in-repo MCP server.

| Document                                                                                                     | Use                                                                                                           |
| ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| [`clawql-agents-spec-v0.1.md`](clawql-agents-spec-v0.1.md)                                                   | **Phases 1–4 + follow-on** — adapters, personal install, OpenClaw live MCP, credentials, Helm, dry OpenBench. |
| [`clawql-harness-spec-v0.1.md`](clawql-harness-spec-v0.1.md)                                                 | **Phases 1–4** — execution-loop harness (`ClawQLHarness`, Ouroboros/OpenCode2 plugins, compare bench).        |
| [`../benchmarks/agents-openbench-plan.md`](../benchmarks/agents-openbench-plan.md)                           | Phase 5 gates + dry harness layout (`benchmarks/agents-bench/`).                                              |
| [`../benchmarks/agents-openbench-spec-v0.1.md`](../benchmarks/agents-openbench-spec-v0.1.md)                 | Agents OpenBench scorecard contract (six agents; Cline catalog-only until spec revision).                     |
| [`../audit/clawql-audit-spec-v0.1.md`](../audit/clawql-audit-spec-v0.1.md)                                   | WORM trail. `clawql-merkle` + `clawql-audit` (sql.js SQLite).                                                 |
| [`../homelab/personal-agent-hermes-cline.md`](../homelab/personal-agent-hermes-cline.md)                     | Personal Mac Mini stack (Hermes orchestrator + Cline executor). Exercises the Cline adapter first.            |
| [`../openclaw/using-openclaw-with-clawql.md`](../openclaw/using-openclaw-with-clawql.md)                     | OpenClaw MCP client guides; package adapter adds ATR/WORM skill plans + live MCP registration scripts.        |
| [`../integrations/cursor-agent-sdk.md`](../integrations/cursor-agent-sdk.md)                                 | Cursor **Agent SDK** (`@grok/agent-sdk`) — ClawQL as MCP connection / audit hook / eval template.             |
| [`ontologiql-runner.md`](ontologiql-runner.md)                                                               | **Combined** Ontologiql drive: ACP + native + shared WORM (`CodingAgentDrive`); Cua isolation pointer (ADR 0018). |
| [`../integrations/cua-spaces.md`](../integrations/cua-spaces.md)                                             | Optional Cua Spaces isolation backend (C1–C4) + license gate.                                                 |
| [`../adr/0017-agent-client-protocol-first-adapters.md`](../adr/0017-agent-client-protocol-first-adapters.md) | **ACP-first** for Ontologiql / runner adapters (Agent Client Protocol ≠ payments ACP).                        |
