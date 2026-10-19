# Multi-attack injection board

Build-first **#1** from the security suite.

## Labels (read first)

| Label | Meaning |
| ----- | ------- |
| **Scripted, worst-case model** | The agent always follows the planted instruction. Measures whether the gateway stops the resulting action — not whether a real model would fall for it. |
| **Smoke sample** | **12** attacks. Planned: dozens across email / ticket / doc / webhook before a category claim. |
| **Headline (v4)** | `clawql_default` **0/12** trusted effectuation + persistent blocked + recall integrity + benign expect-match — gentler defaults (label untrusted→memory; park overwrites only). |

## Columns

| Column | What it means |
| ------ | ------------- |
| **Defaults** | Stock product |
| **Best-config** | General mechanisms — **untrusted-read taint**, **park destructive writes** (overwrites), **data-flow** (block external; label memory) — not a tool-name deny |

Peers (Obot / Bifrost / Executor) are **pending** until defaults + best-config are measured on this corpus (`run-peer.mjs` / `ci-peer-pending.sh`). Injection is an outcome every gateway can be scored on — **not** `not_offered`.

## Run

```bash
npm run build -w clawql-api
npm run benchmark:multi-attack-injection
# Peer row (when URL + shared vault wired):
# OBOT_MCP_URL=… MAI_SHARED_VAULT_ROOT=/tmp/mai-shared/vault \
#   scripts/benchmarks/multi-attack-injection/ci-peer-pending.sh obot defaults
# Live scaffold (placeholder until MAI_LIVE=1):
npm run benchmark:multi-attack-injection:live
```

## Publish gate

Do **not** publish until: peers measured (or clearly pending), configured arm uses only general mechanisms, product defaults shipped and `clawql_default` re-run, benign completion rate is honest (not “secure because it blocks everything”).
