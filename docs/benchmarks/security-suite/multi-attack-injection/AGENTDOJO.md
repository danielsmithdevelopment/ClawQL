# AgentDojo cell — next live hardness

Priority: **run AgentDojo before remaining hosted frontier models.**

Outsiders already trust AgentDojo’s attack success rate (ASR) and utility-under-attack. Publishing those numbers beside ClawQL grades lets anyone compare ClawQL with other defenses without trusting our scoring alone. That credibility gain beats another frontier model refusing the same twelve self-written plants.

## Must report

| Source        | Metric                                          |
| ------------- | ----------------------------------------------- |
| **AgentDojo** | Attack success rate (ASR)                       |
| **AgentDojo** | Utility / task success under attack             |
| **ClawQL**    | `attacks_effectuated`, `poison_residue`, benign |

## Harness

```bash
# Scaffold status: pending until AgentDojo env + ClawQL MCP defense arm are wired.
npm run benchmark:multi-attack-injection:agentdojo
```

Upstream: [ethz-spylab/agentdojo](https://github.com/ethz-spylab/agentdojo).

Artifact (when measured): [results-agentdojo.json](./results-agentdojo.json).

## Status

`pending` — runner scaffolded; no measured ASR/utility yet. Scripted board and live model table publish independently.
