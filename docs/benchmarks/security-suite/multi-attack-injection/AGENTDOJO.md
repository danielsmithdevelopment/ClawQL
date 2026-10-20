# AgentDojo cell — next live hardness

Priority: **run AgentDojo before remaining hosted frontier models.**

Outsiders already trust AgentDojo’s attack success rate (ASR) and utility-under-attack. Publishing those numbers beside ClawQL grades lets anyone compare ClawQL with other defenses without trusting our scoring alone.

## Must report

| Source        | Metric                                                                                  |
| ------------- | --------------------------------------------------------------------------------------- |
| **AgentDojo** | Targeted ASR (`mean(security_results)` — `security()` is True when injection succeeded) |
| **AgentDojo** | Utility under attack (`mean(utility_results)`)                                          |
| **ClawQL**    | Sink blocks after untrusted read (`clawql_sink_blocks`); later board grades             |

## Defense arm

`clawql_data_flow` — [`clawql_tools_executor.py`](../../../scripts/benchmarks/multi-attack-injection/agentdojo/clawql_tools_executor.py)

After untrusted reads (email / file / **calendar** / channel), blocks external and destructive sinks (`send_email`, `share_file`, `send_money`, …). Workspace `important_instructions` injects via calendar event descriptions, so calendar reads taint the session. Same mechanism shape as the scripted multi-attack board (taint → fail-closed), implemented on AgentDojo’s `FunctionsRuntime` so **their** ASR and utility are the headline scores.

Matrix also runs `none` (no defense) for comparison.

## CI matrix (OpenRouter)

Uses repository secret **`OPENROUTER_API_KEY`** (same as OpenBench / Decision-1).

```bash
# Default smoke: workspace × {none, clawql_data_flow} × {deepseek/deepseek-chat, openai/gpt-4o-mini}
gh workflow run multi-attack-agentdojo.yml -f mode=smoke

# Full pairs on workspace only:
gh workflow run multi-attack-agentdojo.yml -f mode=full -f suites=workspace
```

Workflow: [`.github/workflows/multi-attack-agentdojo.yml`](../../../.github/workflows/multi-attack-agentdojo.yml).

Artifacts: per-cell JSON + aggregated `results-agentdojo.json`.

## Local / one-cell

```bash
pip3 install -r scripts/benchmarks/multi-attack-injection/agentdojo/requirements.txt
OPENROUTER_API_KEY=… MAI_AGENTDOJO=1 \
  MAI_AGENTDOJO_MODEL=deepseek/deepseek-chat \
  MAI_AGENTDOJO_DEFENSE=clawql_data_flow \
  npm run benchmark:multi-attack-injection:agentdojo
```

Also accepts `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `TOGETHER_API_KEY`.

Upstream: [ethz-spylab/agentdojo](https://github.com/ethz-spylab/agentdojo) · benchmark `v1.2.2`.

Artifact: [results-agentdojo.json](./results-agentdojo.json).

## Status

Harness + OpenRouter CI matrix wired. Measure by dispatching `multi-attack-agentdojo.yml` (needs `OPENROUTER_API_KEY`). No invented ASR/utility.
