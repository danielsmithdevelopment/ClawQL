# Agents + ClawQL

Open-source agents are **not** built in this repository. These docs describe how ClawQL wraps them (Panguard, WORM, vault, inference) versus the in-repo MCP server.

| Document                                                                                     | Use                                                                                                           |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| [`clawql-agents-spec-v0.1.md`](clawql-agents-spec-v0.1.md)                                   | **Phases 1–4 + follow-on** — adapters, personal install, OpenClaw live MCP, credentials, Helm, dry OpenBench. |
| [`clawql-harness-spec-v0.1.md`](clawql-harness-spec-v0.1.md)                                 | **Phases 1–4** — execution-loop harness (`ClawQLHarness`, Ouroboros/OpenCode2 plugins, compare bench).        |
| [`../benchmarks/agents-openbench-plan.md`](../benchmarks/agents-openbench-plan.md)           | Phase 5 gates + dry harness layout (`integrations/agents-bench/`).                                            |
| [`../benchmarks/agents-openbench-spec-v0.1.md`](../benchmarks/agents-openbench-spec-v0.1.md) | Agents OpenBench scorecard contract (six agents; Cline catalog-only until spec revision).                     |
| [`../audit/clawql-audit-spec-v0.1.md`](../audit/clawql-audit-spec-v0.1.md)                   | WORM trail. `clawql-merkle` + `clawql-audit` (sql.js SQLite).                                                 |
| [`../homelab/personal-agent-hermes-cline.md`](../homelab/personal-agent-hermes-cline.md)     | Personal Mac Mini stack (Hermes orchestrator + Cline executor). Exercises the Cline adapter first.            |
| [`../openclaw/using-openclaw-with-clawql.md`](../openclaw/using-openclaw-with-clawql.md)     | OpenClaw MCP client guides; package adapter adds ATR/WORM skill plans + live MCP registration scripts.        |
