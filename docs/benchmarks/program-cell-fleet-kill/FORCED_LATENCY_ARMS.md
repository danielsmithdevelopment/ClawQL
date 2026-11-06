# Forced renew-latency arms (A/B) — design stub

Chase for any remaining open TTL3s mechanism after journal-surrogate caveats and BOOTTIME hardening. **Not** started until Mac mini soak → `measured_v4_ready` unless run in parallel without claiming v4 auth.

## Arms

| Arm | Inject | What it exercises |
| --- | ------ | ----------------- |
| **A — Ambiguous / timeout** | Drop or time out the renew **response** only | Ambiguous → readback path (`LeaseRenewAmbiguous`) |
| **B — Late Applied** | Delay Applied **response** after storage-successful renew | Timing under slow R2; send-anchored `last_ok` |

Renew-only injection (not all S3). Do **not** raise `CELLD_TTL_MS` to hide races.

## Harness hooks (TBD — not implemented)

Proposed env (names frozen when implementation lands):

- `FLEET_PHASED_FORCE_RENEW_ARM=ambiguous|late_applied|off` (default `off`)
- `FLEET_PHASED_FORCE_RENEW_DELAY_MS` — for arm B only
- Scope: celld renew HTTP/client path or a local proxy in front of R2 renew only

Evidence must still persist per-trial `effect-ledger.json` + `twin-digest.json` (`effectLedgerPersisted=true`).

## Sequencing

1. Mac mini authorizing soak → `measured_v4_ready`
2. v4 N=1000 with ledger persistence; report trial 5 unsettled
3. Arms A+B in parallel or after — see [`AMBIGUOUS_RENEWAL.md`](./AMBIGUOUS_RENEWAL.md)

## Related

- [`TTL3S_THREE_CHECKS.md`](./TTL3S_THREE_CHECKS.md) — trial 1 journal_surrogate caveat; ledger precondition
- [`MAC_MINI_AGENT.md`](./MAC_MINI_AGENT.md)
