# Durable-ack latency (price of the guarantee)

Stock **celld v0.6.3** holds consequential outbound work until a durability proof settles (always-on output gate). The number that matters for ClawQL’s claim is that gate’s `durable_wait` (`wait_us`) on the binary we ship — not a ClawQL fork’s confirm-GET A/B.

## What to publish

| Metric | Source |
| ------ | ------ |
| p50 / p99 gate wait | celld `timing` / `durable_wait` spans (`wait_us`) on stock **0.6.3** |
| Board overlay | fleet harness resumeMs (lease-dominated; do not confuse with gate wait) |
| Proof kind | `proof=fleet` vs `proof=bucket` in the same logs |

## Measured (v3 N=1000 board in progress — stock 0.6.3, TTL=10000)

Partial sample from live node logs on prefix `tier-c-v3-063-*` while write-kill trials ran (`RUST_LOG=timing=debug`). Evidence snapshot: [`durable-wait-stock-0.6.3-v3-partial.json`](../benchmarks/program-cell-fleet-kill/durable-wait-stock-0.6.3-v3-partial.json).

| Metric | Value | Note |
| ------ | ----- | ---- |
| `durable_wait` samples | **425** | Append-mode across restarts; multiple events can fire per trial |
| `wait_us` p50 / p99 / max | **~0.33 s / ~0.70 s / ~0.78 s** | Stock always-on gate on R2 |
| Proof mix | fleet 178 · bucket 247 | Both proof paths appear under fleet ownership |
| ResumeMs | lease floor (~12–14 s at TTL=10000) | **Not** the gate price |

Re-publish the table from the finished v3 evidence file once the board completes (same extraction).

## Retired: PUT-only vs PUT+GET A/B

That comparison measured ClawQL’s temporary `CELLD_FENCED_ACK_CONFIRM_GET` fork flag. Tip 0.6.3 closed the durability boards without that fork — **do not** run PUT vs PUT+GET as a claim gate. Historical clawql.2 numbers (~0.72 s p50 under TTL=3000) stay in git history only.

## How to measure

```sh
RUST_LOG=timing=debug \
  celld --bucket "$CELLD_BUCKET" --endpoint "$S3_ENDPOINT" ...
# scrape: event="durable_wait" wait_us=…
```

## Related

- [clawql-celld.md](./clawql-celld.md) pin §0
- [STATUS.md](../benchmarks/durability-proof/STATUS.md)
- [vendor/celld/UPSTREAM_PIN](../../vendor/celld/UPSTREAM_PIN)
