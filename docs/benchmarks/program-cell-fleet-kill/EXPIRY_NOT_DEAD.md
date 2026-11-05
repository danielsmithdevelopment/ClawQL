# Expiry ≠ dead (lease sweep)

**Lead:** `lease_may_be_fenced_as_dead` treated published expiry as death. That is unsafe whether or not it caused the TTL=3s wedge trials 1 and 5.

## Rule

| Concept | Criterion |
| ------- | --------- |
| **Fenced takeover** | Expiry **or** same-host process evidence. Takeover must fence (epoch bump + storage CAS the old owner cannot pass). |
| **Dead** (abandon open log) | Same-host **process evidence**, or cross-host/unstamped **TTL + fencing**. Never expiry alone on a still-live same-host owner. |

A wedged owner is alive past expiry — that is what wedged means. If `sweep_dead_leaders` recovers an open log while the owner is frozen mid-write, recovery can read before the in-flight intent lands; the new generation starts without it (H2 / stale-incarnation through the sweep path). Stock’s epoch-at-confirm may not cover that path.

## Fix (lab)

- `lease_may_be_fenced` — expiry permits **fencing**, not abandonment.
- `lease_open_log_may_be_recovered_as_dead` — open-log sweep only when abandoned under the table above.
- `sweep_dead_leaders` uses the abandonment predicate for open logs; sealed GC stays on fenceable.

## Deterministic repro (not load)

1. Start a write so intent is in flight (or acked but not yet sent).
2. `SIGSTOP` the owner past lease expiry.
3. Run the sweep (maintenance tick / dead-leader sweep).
4. `SIGCONT` the owner.
5. Assert: intent present; any ack from the old generation rejected.

### Predicate / TLA (fast)

```bash
node docs/examples/streams-celld/scripts/expiry-sweep-intent.test.mjs
CLAWQL_SIMULATE_BUGGY_EXPIRY_AS_DEAD=1 node docs/examples/streams-celld/scripts/expiry-sweep-intent.test.mjs
scripts/formal/run-lease-sweep-expiry-tlc.sh
```

### Real binary e2e (required before N=300)

Paired evidence on **actual lab celld** (real storage, real sweep, real SIGSTOP/CONT):

```bash
# Pre-fix (expect lost intent):
CELLD_BIN=.../celld-lab-pre-fix-expiry-as-dead \
  FLEET_EXPIRY_E2E_LABEL=pre_fix FLEET_EXPIRY_E2E_EXPECT_LOST=1 \
  FLEET_EXPIRY_E2E_OUT=docs/benchmarks/program-cell-fleet-kill/expiry-sweep-e2e-pre-fix.json \
  npm run benchmark:fleet-expiry-sweep-e2e

# Post-fix (expect intent kept):
CELLD_BIN=.../celld-lab-fixed-expiry-not-dead \
  FLEET_EXPIRY_E2E_LABEL=post_fix FLEET_EXPIRY_E2E_EXPECT_KEPT=1 \
  FLEET_EXPIRY_E2E_OUT=docs/benchmarks/program-cell-fleet-kill/expiry-sweep-e2e-post-fix.json \
  npm run benchmark:fleet-expiry-sweep-e2e
```

## E2E result (2026-11-05, lab binaries)

Harness: `scripts/benchmarks/fleet-phased-kill/run-expiry-sweep-e2e.mjs` — absolute `CELLD_BIN`, `/proc/pid/exe` check, owner confirmed `State: T` for the whole hold.

| Build | sha256 (12) | Owner T samples | Eager recovery | Skip abandon | Program intent |
| ----- | ----------- | --------------- | -------------- | ------------ | -------------- |
| **Pre-fix** | `22a6569affd4…` | 11 (held) | **1** (open log recovered+sealed while live) | 0 | **kept** during freeze + after resume |
| **Post-fix** | `1360bdf3f967…` | ≥7 (held) | **0** | **≥2** | **kept** |

Verdicts: `pre_fix_sweep_fired_intent_kept` · `post_fix_skip_abandon_intent_kept`.

**Sweep differential confirmed** (same paired shape as the original fence board): pre-fix abandons open log on expiry alone while the owner is still stopped; post-fix skips.

**Program-level `lost_midflight_intent` not reproduced** on this recipe (`pauseAfterIntentIndex` — intent already durable in ProgramCellDO before SIGSTOP). Per the freeze rule: pre-fix does **not** lose intent end-to-end ⇒ the TTL=3s wedged 2/100 has **another cause**. Expiry≠dead remains a correct safety fix (TLA + e2e sweep shape); it is **not** the proven mechanism for trials 1 and 5.

Evidence: [`expiry-sweep-e2e-pre-fix.json`](./expiry-sweep-e2e-pre-fix.json) · [`expiry-sweep-e2e-post-fix.json`](./expiry-sweep-e2e-post-fix.json).

## 200-cycle soak (availability regression check)

Evidence: [`node-soak-200-expiry-not-dead.json`](./node-soak-200-expiry-not-dead.json) · fixed binary `1360bdf…` · `CELLD_TTL_MS=10000` · n=200.

| Gate | Result |
| ---- | ------ |
| Unique nodes | **2** |
| readyFails | **0** |
| selfFences | **3** (correlated A+B at cycle ~95 within 42ms — host-pause signature; +1 solo B near cycle 195) |
| Suspend void | **not** fired (`BOOTTIME−MONOTONIC` gap stayed ~0 on this cloud VM — clocks appear to freeze together) |
| Wilson / v4 rate gates | **fail** (expected at n=200 even for 0/0; also 3 fences) |

**Regression read:** no readyFails, nodes bounded, no distributed fence storm after expiry≠dead. The dual fence matches prior cloud-VM pause pattern, not a sweep-stall signature. This host cannot authorize soaks ([`SOAK_GATES.md`](./SOAK_GATES.md)); Mac mini / non-suspending host still required for `measured_v4_ready`. Proceed to N=300 correctness bar.

## Order before v4

1. Real-binary e2e before/after (this doc) — **done**; another cause for 2/100
2. **200-cycle** enriched soak on the fixed build vs [`SOAK_GATES.md`](./SOAK_GATES.md) — **done** (no clear avail regression; host invalid for authorizing)
3. Frozen TTL=3s wedged **N=300** — [`N300_TTL3S_WEDGE.md`](./N300_TTL3S_WEDGE.md) (0 lost; any loss fails; append logs + supersede audit) — still required; do not clear via quiet remasures
4. Only then v4 — still blocked; mechanism claim for 2/100 stays open

## Quiet board passes do not clear this

2/100 lost then 0/100 remasure is consistent with ~1% rate. Zero of 100 → ~3.7% UB. N=300 zeros → ~1% UB. N=300 + continued root-cause work carry the claim; quiet remasures do not.

## v4

Still blocked until soak check and N=300 are clean on the fixed binary, and the 2/100 cause is identified (expiry-as-dead alone does not explain it on the e2e recipe).
