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

## Measured (wedged N=100 fenced call-sent remeasure, clawql.2)

Board: hang-`/health`-then-kill `during_call`, `CELLD_FENCED_ACK_CONFIRM_GET=1`, `RUST_LOG=timing=debug`, append-mode node logs, `CELLD_TTL_MS=3000`. Evidence: [`phased-n100-wedge-during-call-fenced.json`](../benchmarks/program-cell-fleet-kill/phased-n100-wedge-during-call-fenced.json).

| Metric | Value | Note |
| ------ | ----- | ---- |
| `durable_wait` samples | **300** | Append-mode across restarts; multiple events can fire per trial |
| `wait_us` p50 / p99 / max | **~0.72 s / ~1.06 s / ~1.26 s** | Diagnostic gate wait (`proof=bucket`) |
| ResumeMs p50 / p99 | **~3.8 s / ~4.6 s** | Lease floor under TTL=3000 — **not** comparable to stock TTL=10000 (~12–14 s) |
| Call-sent | **100/100** pets `inFlight>0` before kill | Rules out blocked-before-send |
| PUT-only vs PUT+GET | **TBD** | Flip `CELLD_FENCED_ACK_CONFIRM_GET=0` for PUT-only arm |

Until a real distribution exists, do **not** quote a gate-latency p50/p99 in publish copy.

