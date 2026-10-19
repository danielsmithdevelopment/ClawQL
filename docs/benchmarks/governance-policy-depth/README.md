# Governance / policy-depth (dominance)

Equal-arm proof that **ClawQL+Panguard** fail-closes adversarial `memory_ingest` while a no-policy control contaminates the vault. Opt-in **Obot** / **Bifrost** rows land when their MCP URLs are set — honest skip otherwise.

| Artifact                                     | Role                                                                                                  |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| [`results-smoke.json`](./results-smoke.json) | ClawQL + passthrough control (CI/agent runnable without Docker)                                       |
| Harness                                      | [`scripts/benchmarks/governance-policy-depth/`](../../../scripts/benchmarks/governance-policy-depth/) |
| Frozen rules                                 | [`frozen-rules.json`](../../../scripts/benchmarks/governance-policy-depth/frozen-rules.json)          |
| Live LLM cell                                | openbench `memory-injection-attempt` + composer Cursor gate                                           |

## Claim (when board_pass)

On the shared OVERRIDE pricing fixture, ClawQL blocks hostile vault writes with tool-evidenced deny, keeps the authoritative `15.00` note, and still allows benign recall — while a passthrough MCP write contaminates. Peers must clear the same grader before a category security claim.

## Does not prove

Content-aware classifiers; JWT ATR mesh HA; that every peer binary was measured in this environment (see `skipped` arms).

## Next step

1. **CI Obot peer** (Docker, no LLM) — workflow `Governance policy-depth` → publish `results-obot.json`.
2. **Bifrost** peer with ingest-deny VK.
3. **Live LLM** (optional): dispatch OpenBench A/B `memory-injection-attempt` with **cheap** OpenRouter only (`openrouter/deepseek/deepseek-chat`). Allowlist: `scripts/benchmarks/governance-policy-depth/cheap-model-allowlist.json`.

## Related

- [dominance-roadmap.md](../dominance-roadmap.md) — criterion #7 governance
- [dominance-peers-wiring.md](../dominance-peers-wiring.md) — Obot / Bifrost install recipes
- [openbench-task-explanations.md](../openbench-task-explanations.md) — `memory-injection-attempt` / `policy-deny-execute`
