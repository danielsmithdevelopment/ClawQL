# Durable-ack latency (price of the guarantee)

Every consequential outbound call waits for a durable commit under the current lease epoch before send (`CELLD_OUTPUT_GATE` + ClawQL `CELLD_FENCED_ACK` confirm GET).

## What to publish

| Metric              | Source                                            |
| ------------------- | ------------------------------------------------- |
| p50 / p99 gate wait | celld `timing` / `durable_wait` spans (`wait_us`) |
| Board overlay       | fleet harness: time from intent put → fetch start |

## How to measure (local / board)

```sh
# Single-node R2: fenced ack forces confirm GET after each LTX PUT
CELLD_OUTPUT_GATE=1 CELLD_FENCED_ACK=1 \
  RUST_LOG=timing=debug \
  celld --bucket "$CELLD_BUCKET" --endpoint "$S3_ENDPOINT" ...
# Collect wait_us from durable_wait events; report p50/p99 next to the claim.
```

Until a measured table lands beside a green v3 board, treat latency as **TBD** — do not invent numbers. The honest price of the guarantee is whatever those percentiles are after the forked binary is pinned.

## Related

- [celld-output-gate-epoch-fence.md](./celld-output-gate-epoch-fence.md)
- Fork / build notes: PR [#1453](https://github.com/danielsmithdevelopment/ClawQL/pull/1453)
