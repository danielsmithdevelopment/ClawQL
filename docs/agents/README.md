# Agents + ClawQL

Open-source agents are **not** built in this repository. These docs describe how ClawQL wraps them (Panguard, WORM, vault, inference) versus the in-repo MCP server.

| Document                                                                                     | Use                                                                                                   |
| -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| [`clawql-agents-spec-v0.1.md`](clawql-agents-spec-v0.1.md)                                   | **Phase 1–2** — Cline + OpenClaw + Hermes in `packages/clawql-agents/`.                                                   |
| [`../audit/clawql-audit-spec-v0.1.md`](../audit/clawql-audit-spec-v0.1.md)                   | WORM trail. `clawql-merkle` + `clawql-audit` (sql.js SQLite).                                         |
| [`../homelab/personal-agent-hermes-cline.md`](../homelab/personal-agent-hermes-cline.md)     | Personal Mac Mini stack (Hermes orchestrator + Cline executor). Exercises the Cline adapter first.    |
| [`../openclaw/using-openclaw-with-clawql.md`](../openclaw/using-openclaw-with-clawql.md)     | OpenClaw MCP client guides; package adapter adds ATR/WORM skill plans.                              |
| [`../benchmarks/agents-openbench-spec-v0.1.md`](../benchmarks/agents-openbench-spec-v0.1.md) | Agents OpenBench v0.1 (six agents in the scorecard; Cline is catalog-only until the spec is revised). |
| [`../benchmarks/agents-openbench-plan.md`](../benchmarks/agents-openbench-plan.md)           | Implementation gates — do not scaffold `integrations/agents-bench/` yet.                              |
