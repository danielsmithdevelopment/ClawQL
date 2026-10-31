# Stale-owner probe (tip 0.6.3) — not yet measured

## Why this is separate from wedged-health N=100

The wedged `during_call` board hangs readiness so the lease can move, then SIGKILLs while the outbound call is in flight. Stock **0.6.3** held that board (**0/100** lost, **100/100** call-sent) at `CELLD_TTL_MS=3000` (disclosed — not stock 10s).

That does **not** prove the Fleet-proof path’s skipped `VerifyOwnership` is harmless. The interesting residual is: an **old owner process still writing / settling the output gate after `own.json` already names a new owner**, without relying on kill timing.

## Target observation

1. Two-node stock 0.6.3 fleet (wedge-capable binary only for chaos readiness hang).
2. Start a write that enters the output gate (Fleet or Bucket proof).
3. Move ownership (wedge readiness / lease expiry) while the old owner is still alive.
4. Confirm via bucket `own.json` (or peer diagnose) that the new owner holds the cell **before** the old owner’s gate settles.
5. Pass if the old owner **does not** ack/send after that flip (gate fails closed). Fail if it acks/sends as a stale writer (especially on a Fleet proof).

## Status

Not run yet. Until it fails on tip, upstream contact stays the **short question** in `BUG_REPORT_DRAFT.md`, not a bug report. If this probe loses intents on stock 0.6.3, upgrade the draft to a tip bug report with that reproduction before sending.
