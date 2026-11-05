# Expiry ≠ dead (lease sweep)

Published lease **expiry ≠ dead**. A wedged owner is alive past expiry; treating
expiry as abandonment lets an open-log sweep recover before an in-flight intent
lands (H2 / stale-incarnation through the sweep path).

## Rule

| Concept | Criterion |
| ------- | --------- |
| **Fenced takeover** | Expiry **or** same-host process evidence. Takeover must fence (epoch bump + storage CAS the old owner cannot pass). |
| **Dead** (abandon open log) | Same-host **process evidence**, or cross-host/unstamped **TTL + fencing**. Never expiry alone on a still-live same-host owner. |

## Formal oracle (on `main`)

```bash
scripts/formal/run-lease-sweep-expiry-tlc.sh
```

Spec: [`formal/tla/lease/`](../../../formal/tla/lease/) — target PASS; weak
`WeakTreatExpiryAsDead` must COUNTEREXAMPLE.

## Lab implementation (stack; not yet on `main`)

Rust predicates + deterministic SIGSTOP recipe + paired e2e evidence live on the
celld soak stack tip ([PR #1464](https://github.com/danielsmithdevelopment/ClawQL/pull/1464)
and parents):

- `lease_may_be_fenced` — expiry permits **fencing**, not abandonment
- `lease_open_log_may_be_recovered_as_dead` — open-log sweep only when abandoned
- `docs/examples/streams-celld/scripts/expiry-sweep-intent.test.mjs`

Expiry≠dead is a correct safety fix (TLA + lab e2e sweep shape). It is **not**
by itself the proven mechanism for the TTL=3s wedge 2/100 lost-intent trials;
v4 remains blocked on that stack until soak + N=300 clear on the fixed binary.
