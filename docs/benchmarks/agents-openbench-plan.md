---
title: "ClawQL Agents OpenBench — Implementation Plan"
status: "August 2026"
version: "0.1"
---

# ClawQL Agents OpenBench — Implementation Plan

**August 2026 · v0.1**

Companion to [`agents-openbench-spec-v0.1.md`](agents-openbench-spec-v0.1.md) and [`../agents/clawql-agents-spec-v0.1.md`](../agents/clawql-agents-spec-v0.1.md).

## Goal

Measure **infrastructure lift** (Panguard, vault memory, WORM completeness, PAL routing) across RockYourLobster catalog agents — same model weights, baseline vs ClawQL-augmented arms.

This is **not** the MCP Track A/B harness under [`openbench/`](../../openbench/) (opencode / ClawQL-as-harness). Agents OpenBench wraps the seven catalog agents via `clawql-agents`.

## Gates (do not skip)

| Gate                 | Criteria                                                                   | Status                     |
| -------------------- | -------------------------------------------------------------------------- | -------------------------- |
| Adapters Phase 1–4   | All seven agents in `packages/clawql-agents`                               | **Shipped** (#945)         |
| Harvey LAB publish   | Contiguous firm-knowledge results ledger published                         | **Pending**                |
| ExtractBench publish | ExtractBench action plan results usable as Family M seed                   | **Pending**                |
| Stub-tool catalog    | Family S tools (`email_*`, …) defined as harness stubs, not fake MCP names | **Pending**                |
| Dry runner           | `runAgentBenchmarkDry` + `integrations/agents-bench`                       | **Shipped (this PR)**      |
| Live A/B CI          | Matrix jobs with spend caps                                                | **Blocked on gates above** |

## Layout

```
integrations/agents-bench/     — harness entry, fixtures, dry-run script
packages/clawql-agents/
  src/bench/dry-runner.ts      — Effect dry scorecard (session + stub arms)
  helm/<agent>/values-clawql.yaml
docs/benchmarks/
  agents-openbench-plan.md     — this file
  agents-openbench-spec-v0.1.md
```

Do **not** add `packages/clawql-agents/bench/runner.ts` as a second live harness.

## Phased delivery

1. **Dry scorecard** — session lifecycle + stub CPR/token delta (done).
2. **Family S smoke** — readonly ATR deny of `execute`; memory recall success path (fixture shipped).
3. **Family M/P** — after ExtractBench / Harvey gates; wire real model calls through clawql-inference.
4. **Cline ledger revision** — OpenBench v0.1 is six agents; adding Cline is +15 tasks or Family S MVP (explicit spec bump).

## Exit criteria for “Phase 5 complete”

- Live runner executes ≥1 Family S task per shipped agent with WORM completeness check.
- CI job (manual or nightly) records scorecard artifact.
- Helm overlays documented for at least Cline + OpenClaw + Hermes.
