# celld output gate (mechanism — stock tip)

**Priority:** top — durability selling point. Restore “intent durable before send” only after **v3 N=1000 on stock 0.6.3** passes with automatic R2 intent checks.  
**Upstream:** [denoland/celld](https://github.com/denoland/celld) (Apache-2.0) **`v0.6.3`** — product pin ([`UPSTREAM_PIN`](../../vendor/celld/UPSTREAM_PIN)).  
**ClawQL fork:** **retired** ([`FORK.md`](../../vendor/celld/FORK.md)). Tip boards closed the mid-flight gap without ClawQL patches.

## What closed the gap

On pinned **0.4.0**, ClawQL’s mid-flight interleaving could lose a pretends-journaled intent under node wedges (R2 settle: five `during_call` gaps). Stock **0.6.3** always-on durability wait held:

| Board | Result |
| ----- | ------ |
| Wedged `during_call` N=100 | 0 lost intents, 100/100 call-sent (`CELLD_TTL_MS=3000` disclosed) |
| Stale-owner SIGSTOP/CONT N=40 | 0 `staleSend`, 40/40 ownership moved (`CELLD_TTL_MS=2000` disclosed) |

Credit upstream for the always-on gate. Own the 0.4.0 + interleaving failure mode in public copy ([cost-plus-thread-correction.md](../gtm/cost-plus-thread-correction.md)).

## ClawQL side (this repo)

| Item | Status |
| ---- | ------ |
| Pause mechanism claim until v3 green on 0.6.3 | In force |
| Pin stock 0.6.3 + attestation in CI | `scripts/ci/install-celld-pinned.sh` |
| TLA+ `IntentDurablyAckedBeforeSend` | In tree |
| Mid-flight harness intent check | `run-board.mjs` (`lost_midflight_intent`) |
| Measure stock gate wait | [`celld-durable-ack-latency.md`](./celld-durable-ack-latency.md) — `durable_wait`, not PUT vs PUT+GET |
| Offer boards upstream | [`BUG_REPORT_DRAFT.md`](../../vendor/celld/upstream-report/BUG_REPORT_DRAFT.md) |

## Restore claim only when

1. Product pin is stock **0.6.3** (attested install in CI).  
2. Tip wedged + stale-owner boards green (done).  
3. v3 board: frozen option-2 criteria **and** every mid-flight trial verifies intent; correctness includes lost-intent as failure.  
4. Stock `durable_wait` p50/p99 published beside the claim.

## Non-fixes

- Local `storage.get` after `put` is sanity only — not the durability proof.  
- Stretching lease TTL alone does not close mid-flight loss.  
- Re-introducing a ClawQL celld fork for fencing is not required for this gap.
