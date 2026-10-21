# Kill-mid-write board (security suite Tier D)

**Metric:** `duplicate_side_effects == 0` after SIGKILL mid-write + resume (file-journal durable programs).

```bash
# CI default N=50
npm run benchmark:kill-mid-write

# Heavier local / publish run
KILL_MID_WRITE_N=500 npm run benchmark:kill-mid-write
```

Writes [`evidence.json`](./evidence.json).

## Honesty

- Proves the **program journal** write-intent contract under process kill (same substrate as `demo:kill-node-standin`).
- Does **not** yet exercise mandate park/consume across two gateway replicas (approval-integrity `concurrent_crash` cell — follow-up).
- Does **not** prove celld fleet LTX. See [durability-proof STATUS](../../durability-proof/STATUS.md).

## Related

- TLA+: `formal/tla/mandate/MandateLifecycle.tla` (crash-after-consume → `outcome_unknown`)
- ProgramCellDO isolate kill: [`../../program-cell-isolate-kill/`](../../program-cell-isolate-kill/)
