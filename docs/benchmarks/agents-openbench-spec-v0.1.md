---
title: "ClawQL Agents OpenBench — Specification"
status: "August 2026"
version: "0.1"
---

# ClawQL Agents OpenBench — Specification

**August 2026 · v0.1**

## 1. Purpose

Agents OpenBench answers: _same model, same task — how much do Panguard, vault memory, and WORM change correctness, tokens, and turns for each RockYourLobster catalog agent?_

## 2. Agents in the scorecard

| Agent            | In v0.1 ledger   | Notes                                        |
| ---------------- | ---------------- | -------------------------------------------- |
| OpenClaw         | Yes              |                                              |
| Hermes           | Yes              |                                              |
| Pi               | Yes              |                                              |
| Goose            | Yes              |                                              |
| DeepSeek Harness | Yes              |                                              |
| OpenHands        | Yes              |                                              |
| Cline            | **Catalog only** | Add via revision (+15 tasks or Family S MVP) |

**Six agents × families S/M/P = 90 tasks** in the v0.1 ledger shape (15 tasks × 6). Exact task IDs land when the stub-tool catalog and Harvey/ExtractBench gates clear — see the [plan](agents-openbench-plan.md).

## 3. Families

| Family | Focus                                             | Arms                                                              |
| ------ | ------------------------------------------------- | ----------------------------------------------------------------- |
| **S**  | Scope / safety (ATR deny, path deny, plugin deny) | Often 3 arms for abliteration studies; M/P use baseline vs ClawQL |
| **M**  | Memory / institutional continuity                 | baseline vs ClawQL                                                |
| **P**  | Production ops (budget, cron, delegation)         | baseline vs ClawQL                                                |

## 4. Metrics

Per task, both arms report:

- **CPR** — composite pass rate (task-specific checkers)
- **tokens** — total prompt+completion through clawql-inference when used
- **wormComplete** — every consequential action has a WORM entry (`clawql-audit` verify)
- **delta.cprLift**, **delta.tokenReduction**

## 5. ATR rules

- Shippable templates use **real MCP tool names** only (`memory_*`, `search`, `execute`, …).
- Family S stub tools (`email_send`, …) are **harness-local**; never register them on ClawQL MCP.

## 6. Runner contract

```typescript
runAgentBenchmarkDry({ agentName, family, tasks, config }) → BenchmarkScorecard
```

Live runner (future) replaces stub arms with model+tool execution while keeping the same scorecard shape. Implementation entry: `integrations/agents-bench/` + `clawql-agents` `runAgentBenchmarkDry`.

## 7. Relationship to MCP OpenBench

|          | MCP `openbench/`                     | Agents OpenBench                          |
| -------- | ------------------------------------ | ----------------------------------------- |
| Subject  | ClawQL as coding harness / MCP tools | Catalog agents wrapped by `clawql-agents` |
| CI today | `openbench-ab.yml`                   | Dry-run only                              |
| Location | `openbench/`                         | `integrations/agents-bench/`              |
