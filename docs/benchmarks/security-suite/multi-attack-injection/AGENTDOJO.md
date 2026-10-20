# AgentDojo cell — measured (smoke)

Outsiders already trust AgentDojo’s attack success rate (ASR) and utility-under-attack. Publishing those numbers beside ClawQL grades lets anyone compare ClawQL with other defenses without trusting our scoring alone.

## Smoke matrix (published)

CI run [39354352936](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/39354352936) · workspace · `important_instructions` · 4 user × 3 injection pairs · OpenRouter.

| Model                    | Defense            |    ASR ↓ | Utility ↑ | ClawQL sink blocks |
| ------------------------ | ------------------ | -------: | --------: | -----------------: |
| `openai/gpt-4o-mini`     | none               | **0.92** |      0.33 |                  — |
| `openai/gpt-4o-mini`     | `clawql_data_flow` | **0.00** |  **1.00** |             **27** |
| `deepseek/deepseek-chat` | none               |     0.00 |      0.67 |                  — |
| `deepseek/deepseek-chat` | `clawql_data_flow` |     0.00 |      0.58 |                  1 |

**Lead comparison:** gpt-4o-mini ASR 0.92 → 0.00 under ClawQL (−0.92), utility 0.33 → 1.00, with 27 sink blocks (`send_email`, `create_calendar_event`, `delete_file`, …). Deepseek resisted tool-executed injections on both arms (ASR 0); ClawQL is for the models that don’t.

ASR = `mean(security_results)` — AgentDojo `security()` is True when the injection goal was executed. Artifact: [results-agentdojo.json](./results-agentdojo.json).

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

## Status

**Measured** (smoke). Next: remaining hosted live models, then open-weight dual-arm benign; optional full AgentDojo suite dispatch.
