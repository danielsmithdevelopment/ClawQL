# AgentDojo cell — next live hardness

Priority: **run AgentDojo before remaining hosted frontier models.**

Outsiders already trust AgentDojo’s attack success rate (ASR) and utility-under-attack. Publishing those numbers beside ClawQL grades lets anyone compare ClawQL with other defenses without trusting our scoring alone.

## Must report

| Source | Metric |
| ------ | ------ |
| **AgentDojo** | Targeted ASR (`1 − mean(security_results)`) |
| **AgentDojo** | Utility under attack (`mean(utility_results)`) |
| **ClawQL** | Sink blocks after untrusted read (`clawql_sink_blocks`); later board grades |

## Defense arm

`clawql_data_flow` — [`clawql_tools_executor.py`](../../../scripts/benchmarks/multi-attack-injection/agentdojo/clawql_tools_executor.py)

After untrusted reads (email / file / channel), blocks external and destructive sinks (`send_email`, `share_file`, `send_money`, …). Same mechanism shape as the scripted multi-attack board (taint → fail-closed), implemented on AgentDojo’s `FunctionsRuntime` so **their** ASR and utility are the headline scores.

## Harness

```bash
pip3 install agentdojo   # once
# Status / credential gate:
npm run benchmark:multi-attack-injection:agentdojo
# Live measure (needs LLM key):
OPENAI_API_KEY=… MAI_AGENTDOJO=1 npm run benchmark:multi-attack-injection:agentdojo
# Optional subset / model:
MAI_AGENTDOJO_SUITE=workspace MAI_AGENTDOJO_ATTACK=important_instructions \
  MAI_AGENTDOJO_USER_TASKS=user_task_0,user_task_1 \
  MAI_AGENTDOJO_MODEL=gpt-4o-mini-2024-07-18 \
  OPENAI_API_KEY=… MAI_AGENTDOJO=1 npm run benchmark:multi-attack-injection:agentdojo
```

Also accepts `ANTHROPIC_API_KEY` or `TOGETHER_API_KEY`.

Upstream: [ethz-spylab/agentdojo](https://github.com/ethz-spylab/agentdojo) · benchmark `v1.2.2`.

Artifact: [results-agentdojo.json](./results-agentdojo.json).

## Status

`wired_awaiting_llm_credentials` — ClawQL defense + runner wired and unit-tested; no invented ASR/utility. Re-run with an API key to measure. Scripted board and live model table publish independently.
