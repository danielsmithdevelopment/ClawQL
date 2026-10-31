# Stale-owner probe (tip 0.6.3)

## Why this is separate from wedged-health N=100

The wedged `during_call` board waits for mock-pets `inFlight` **then** wedges and SIGKILLs. Stock **0.6.3** held that board (**0/100** lost) at `CELLD_TTL_MS=3000` (disclosed).

That does **not** exercise “old owner still settling the output gate after `own.json` names a new owner.” The Fleet proof path still skips `VerifyOwnership` on tip; this probe is aimed at that gap.

## Harness (`FLEET_PHASED_STALE_OWNER=1`)

Requires `FLEET_PHASED_WEDGE_HEALTH=1`. Method: **`SIGSTOP` → lease expire → `SIGCONT`** (health-wedge alone does **not** stop node-lease renewal, so `own.json` never left the victim in the first probe).

For each `during_call` trial:

1. Start the hang-on-fetch write on the victim; brief head-start into the output gate.
2. **SIGSTOP** the victim (cannot renew lease); keep readiness wedge as belt-and-suspenders.
3. Poll R2 `cells/<ProgramCellDO>/own.json` until it no longer names the victim’s `CELLD_NODE`.
4. **SIGCONT** (live stale writer); watch for late `inFlight`.
5. **Fail correctness** (`stale_owner_send`) if inFlight first appears **after both** ownership move and thaw.
6. SIGKILL; resume on survivor; still require intent visible (`lost_midflight_intent` if missing).
7. If ownership never moved → availability `ownership_never_moved`.

Evidence: `docs/benchmarks/program-cell-fleet-kill/phased-n40-stale-owner-upstream-0.6.3.json` (N=40 tip board).

## Result — stock 0.6.3 N=40 (PASS)

Measured **2026-10-31 08:07 PDT** (`2026-10-31T15:07:10.047Z`) · `fenceMode=upstream_0.6.3_stale_owner_sigstop` · `ok=true`.

| Metric | Result |
| ------ | ------ |
| Trials | **40/40** |
| `ownershipMoved` | **40/40** (lazy `own.json` flip after survivor poke) |
| `staleSend` | **0/40** |
| `lost_midflight_intent` | **0/40** |
| `callSent.sawInFlight` | **40/40** (egress after durable ack, before freeze) |
| Correctness / availability | **0** failures |

**Meaning:** tip closes the stale-writer-after-takeover path on this board. Do **not** upgrade the Ry draft to a bug report for this mode. Broader mechanism claim still waits on green **v3 N=1000** at stock TTL=10s. N=40 alone only bounds residual staleSend below ~7.5% (rule-of-three).

## Pass / fail for durability claim

| Result | Meaning for claim |
| ------ | ----------------- |
| 0 staleSend, ownership usually moved, 0 lost intent | Tip closes this path — claim can rest on stock 0.6.3 *(this board)* |
| staleSend > 0 on tip | Tip bug — upgrade email to bug report; land Fleet VerifyOwnership (+ epoch) on a clawql binary and re-prove |
| ownership rarely moves | Raise hold / lower TTL; do not claim either way |

## TTL disclosure

Stale-owner tip board uses a short lease (`CELLD_TTL_MS=2000`, hold 6s) so ownership can flip during the durable wait. Not stock 10s — disclosed in evidence `resumeLatencyNote` / `celldTtlMs`. Resume p50≈10.6s on this board is hold/ownership-poll dominated, not a stock-TTL lease floor.
