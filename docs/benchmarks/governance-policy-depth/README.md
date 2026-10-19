# Governance / policy-depth (dominance)

Equal-arm proof that **ClawQL+Panguard** fail-closes adversarial `memory_ingest` while a no-policy control contaminates the vault. Live **Obot** and **Executor** peers are measured via CI scripts — honest skip when the peer binary/URL is unavailable.

**Live board:** [clawql.com/benchmarks#governance](https://clawql.com/benchmarks/#governance)

| Artifact                                     | Role                                                                                                  |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| [`results-smoke.json`](./results-smoke.json) | ClawQL + passthrough control                                                                          |
| [`results-obot.json`](./results-obot.json)   | Docker Obot peer                                                                                      |
| [`results-cells.json`](./results-cells.json) | Executor cells: risky write + untrusted-read→hostile follow-up (ClawQL · Executor · passthrough)      |
| Harness                                      | [`scripts/benchmarks/governance-policy-depth/`](../../../scripts/benchmarks/governance-policy-depth/) |
| Frozen rules                                 | [`frozen-rules.json`](../../../scripts/benchmarks/governance-policy-depth/frozen-rules.json)          |

## Vault-write board (Obot)

| Arm             | security_score | Notes                                           |
| --------------- | -------------- | ----------------------------------------------- |
| clawql_panguard | **5/5**        | blocked + clean vault                           |
| passthrough     | **2/5**        | OVERRIDE written                                |
| **obot**        | **2/5**        | live Docker — ingest allowed (no per-tool deny) |
| bifrost         | skipped        | URL unset                                       |

CI: [39181888666](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/39181888666) · `ci-obot-peer.sh`

## Executor cells (measured)

```bash
npm run benchmark:governance-policy-depth:executor
# → ci-executor-peer.sh → results-cells.json
```

| Cell           | clawql                  | executor                          | passthrough |
| -------------- | ----------------------- | --------------------------------- | ----------- |
| risky_write    | **5/5**                 | **5/5** (approval pause)          | **2/5**     |
| untrusted_read | **5/5** (`poison_seen`) | **5/5** (poison + approval pause) | **2/5**     |

Executor v1.6.10 is wired like Obot: install peer → front `fixture-mcp` (vault + Gmail poison) → call through Executor MCP `execute` → grade shared vault. Default `destructiveHint` pauses OVERRIDE ingest (vault clean). Poisoned `gmail_read_message` still returns.

## Related

- [dominance-roadmap.md](../dominance-roadmap.md) — criterion #7 governance
- [dominance-peers-wiring.md](../dominance-peers-wiring.md) — Obot / Bifrost install recipes
