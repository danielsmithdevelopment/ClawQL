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

Peers (Obot / Bifrost / Executor) do **not** ship a built-in Obsidian vault. Fair comparison fronts the same popular standard ClawQL already grades: **Obsidian-compatible `Memory/` Markdown** via `vault-mcp.mjs` (`shared-obsidian-vault.sh`). Injection is an outcome every gateway can be scored on — **not** `not_offered`.

## Run

```bash
npm run build -w clawql-api
npm run benchmark:multi-attack-injection
# Measure peers (writes peer-results/, merges into smoke board):
npm run benchmark:multi-attack-injection:peers
# Or individually:
npm run benchmark:multi-attack-injection:bifrost
npm run benchmark:multi-attack-injection:executor
npm run benchmark:multi-attack-injection:obot   # Mac mini + Docker; stamps host_os=darwin
npm run benchmark:multi-attack-injection:counterfeit-policy  # Datadog/Jev cell
# Live cell (hard-recall vault grading; optional model matrix):
MAI_LIVE=1 npm run benchmark:multi-attack-injection:live
# With models requested but no session transport → status=incomplete (never fabricates):
# MAI_LIVE=1 MAI_LIVE_MODELS=composer-2.5-fast npm run benchmark:multi-attack-injection:live
```

Obot equal-arm runbook: [MAC-MINI-OBOT.md](../../../docs/benchmarks/security-suite/multi-attack-injection/MAC-MINI-OBOT.md). Best-config = Obot native webhook filter deny on `memory_ingest` (not deny-tools). Precondition: one refused `memory_ingest` outside the corpus, then one 12+14 run. Docker Desktop VM is fine for effectuation outcomes.

Counterfeit-policy cell: [COUNTERFEIT-POLICY.md](../../../docs/benchmarks/security-suite/multi-attack-injection/COUNTERFEIT-POLICY.md) — ClawQL deterministic measured; model-judged peers pending (cite Datadog; public-set + JevShield best-config; no stand-in).

## Publish gate

Scripted board is complete (Obot/Bifrost/Executor defaults + best-config). Before a lead claim: version pins on every row, scripted honesty labels, [maintainer invites](../../../docs/benchmarks/security-suite/multi-attack-injection/MAINTAINER-INVITE.md), then `MAI_LIVE=1` real-model sessions (hard-recall vault cell already measured).
