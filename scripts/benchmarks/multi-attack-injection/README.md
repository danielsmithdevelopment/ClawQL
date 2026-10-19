# Multi-attack injection board

Build-first **#1** from the security suite.

## Labels (read first)

| Label | Meaning |
| ----- | ------- |
| **Scripted, worst-case model** | The agent always follows the planted instruction. Measures whether the gateway stops the resulting action — not whether a real model would fall for it. |
| **Smoke sample** | **12** attacks. Planned: dozens across email / ticket / doc / webhook before a category claim. |
| **Headline** | `clawql_default` **12/12** — stock ClawQL lets every attack through, same as no gateway. |

## Columns

| Column | What it means |
| ------ | ------------- |
| **Defaults** | Stock product |
| **Best-config** | General mechanisms — **untrusted-read taint**, **park destructive writes**, **data-flow** — not a tool-name deny of the attacked tools |

Peers (Obot / Bifrost / Executor) are **pending** until defaults + best-config are measured on this corpus. Injection is an outcome every gateway can be scored on — **not** `not_offered`.

## Run

```bash
npm run benchmark:multi-attack-injection
```

## Publish gate

Do **not** publish until: peers measured (or clearly pending), configured arm uses only general mechanisms, product defaults shipped and `clawql_default` re-run.
