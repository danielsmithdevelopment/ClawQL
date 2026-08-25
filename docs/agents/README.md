# Agents + ClawQL

Open-source agents are **not** built in this repository. These docs describe how ClawQL wraps them (Panguard, WORM, vault, inference) versus the in-repo MCP server.

| Document                                                                                     | Use                                                                                                    |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| [`clawql-agents-spec-v0.1.md`](clawql-agents-spec-v0.1.md)                                   | **Phases 1–4** — all seven adapters in `packages/clawql-agents/`. Phase 5 (OpenBench/Helm) gated.      |
| [`clawql-harness-spec-v0.1.md`](clawql-harness-spec-v0.1.md)                                 | **Phases 1–4** — execution-loop harness (`ClawQLHarness`, Ouroboros/OpenCode2 plugins, compare bench). |
| [`../audit/clawql-audit-spec-v0.1.md`](../audit/clawql-audit-spec-v0.1.md)                   | WORM trail. `clawql-merkle` + `clawql-audit` (sql.js SQLite).                                          |
| [`../homelab/personal-agent-hermes-cline.md`](../homelab/personal-agent-hermes-cline.md)     | Personal Mac Mini stack (Hermes orchestrator + Cline executor). Exercises the Cline adapter first.     |
| [`../openclaw/using-openclaw-with-clawql.md`](../openclaw/using-openclaw-with-clawql.md)     | OpenClaw MCP client guides; package adapter adds ATR/WORM skill plans.                                 |
| [`../benchmarks/agents-openbench-spec-v0.1.md`](../benchmarks/agents-openbench-spec-v0.1.md) | Agents OpenBench v0.1 (six agents in the scorecard; Cline is catalog-only until the spec is revised).  |
| [`../benchmarks/agents-openbench-plan.md`](../benchmarks/agents-openbench-plan.md)           | Implementation gates — do not scaffold `integrations/agents-bench/` yet.                               |
