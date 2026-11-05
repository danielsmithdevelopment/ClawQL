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

Predicate-layer test (fails every time on the buggy rule):

```bash
node docs/examples/streams-celld/scripts/expiry-sweep-intent.test.mjs
# Counterexample demo:
CLAWQL_SIMULATE_BUGGY_EXPIRY_AS_DEAD=1 node docs/examples/streams-celld/scripts/expiry-sweep-intent.test.mjs
```

Rust unit tests: `host_process::wedged_owner_past_expiry_blocks_open_log_abandonment`.

TLA+ (TLC weak config must counterexample):

```bash
scripts/formal/run-lease-sweep-expiry-tlc.sh
```

## Quiet board passes do not clear this

2/100 lost then 0/100 remasure is consistent with ~1% rate. Zero events in 100 trials still leave a 95% upper bound near **3.7%**. After the fix, rerun the TTL=3s wedge board with more trials (**N=300** with zero losses → bound near 1%). The deterministic test carries the real proof.

## v4

Still blocked until the fix is in the measured binary and the TTL=3s wedge board is clean at higher N. Mechanism claim stays paused.
