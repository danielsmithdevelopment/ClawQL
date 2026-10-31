# Upstream offer — denoland/celld

**Tip checked:** [denoland/celld](https://github.com/denoland/celld) **v0.6.3** wedged `during_call` N=100 on R2 — **0/100** `lost_midflight_intent`, **100/100** `callSent.sawInFlight` (always-on gate).  
**TTL disclosure:** that wedge board used `CELLD_TTL_MS=3000` (faster lease move), not stock ~10s.  
**ClawQL fleets:** moving measured boards to **stock 0.6.3** (claim evidence must match what we ship). Fork `0.4.0-clawql.*` retained only for patches tip lacks (alive/ready, optional epoch/Fleet VerifyOwnership).  
**License:** Apache-2.0  
**Contact:** short **question** to **ry@deno.com** (not a bug report — tip held). PRs disabled; optional tiny format-patch only if they ask. Keep private until they respond.

Draft: [`upstream-report/BUG_REPORT_DRAFT.md`](upstream-report/BUG_REPORT_DRAFT.md)  
Evidence: `docs/benchmarks/program-cell-fleet-kill/phased-n100-wedge-upstream-0.6.3.json`

## Filing posture

Tip already handles the wedged mid-flight path we care about. Do **not** file a bug led by “real on 0.4.0 with the gate off.” Ask whether Fleet proofs intentionally skip `VerifyOwnership`, and whether a small patch would be welcome.

**Still open before claiming a tip bug:** a dedicated **stale-owner** probe (old owner still writing after takeover). Wedged-health N=100 held; that is not the same test.

## Optional patches (only if upstream wants them)

1. **Output gate VerifyOwnership for Fleet proofs too** (`crates/logic/output_gate.rs`).
2. **Epoch-current at confirm** before advancing `synced_seq` / returning from `await_durable`.
3. Availability (separate, ClawQL clawql.3): alive vs ready + bounded maintenance — tip 0.6.3 has no `/alive` yet.

## Contact

Human email to ry@deno.com (see draft). If upstream lands equivalent fencing, ClawQL unpins the fork and uses stock `celld.dev` install.
