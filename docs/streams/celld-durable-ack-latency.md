# Durable-ack latency (price of the guarantee)

Every consequential outbound call waits for a durable commit under the current lease epoch before send (`CELLD_OUTPUT_GATE` default-on + ClawQL `CELLD_FENCED_ACK` with epoch-at-confirm).

## What to publish

| Metric | Source |
| ------ | ------ |
| p50 / p99 gate wait | celld `timing` / `durable_wait` spans (`wait_us`) |
| Board overlay | fleet harness: time from intent put → fetch start |
| PUT-only vs PUT+GET | A/B with `CELLD_FENCED_ACK_CONFIRM_GET=0` vs `1` (epoch check stays on) |

## Confirm GET — open measurement

The ~0.6 s wait on R2 boards is PUT **plus** confirming GET per consequential sync. Before optimizing it away:

1. **Hypothesis A:** R2/S3 `PutObject` success already means the object is durably stored and immediately readable (S3 read-after-write). Then the original bug was likely **sequence / gate advance before the PUT returned**, not missing durability of a successful PUT — and the confirm GET mostly doubles RTT.
2. **Hypothesis B:** Under load / multipart / eventual paths, PUT success can race a survivor restore; the GET is load-bearing for H1.

**How to decide:** run the same focused during_call (+ wedge) board twice with `CELLD_FENCED_ACK=1` and epoch-at-confirm always on:

| Arm | Flag | Expect |
| --- | ---- | ------ |
| PUT+GET+epoch | `CELLD_FENCED_ACK_CONFIRM_GET=1` (default) | current fence |
| PUT+epoch | `CELLD_FENCED_ACK_CONFIRM_GET=0` | lower `wait_us`; correctness must stay green |

Publish whichever arm holds under the kill board. Do not drop the GET on latency alone.

Object-store path: `write_ltx_file` → `object_store` `put_opts` / multipart `complete` (see `vendor/celld/crates/ltx/src/client/object_store.rs`). No extra “commit” API after PUT return.

## How to measure (local / board)

```sh
# Default fence (PUT + confirm GET + epoch)
CELLD_OUTPUT_GATE=1 CELLD_FENCED_ACK=1 \
  RUST_LOG=timing=debug \
  celld --bucket "$CELLD_BUCKET" --endpoint "$S3_ENDPOINT" ...

# PUT-only + epoch (A/B)
CELLD_FENCED_ACK_CONFIRM_GET=0 ...
```

Until a measured table lands beside a green focused/wedged board, treat latency as **TBD** — do not invent numbers.

## Related

- [celld-output-gate-epoch-fence.md](./celld-output-gate-epoch-fence.md)
- [vendor/celld/FORK.md](../../vendor/celld/FORK.md)
