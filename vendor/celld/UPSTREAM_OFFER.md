# Upstream offer — denoland/celld

**Tip checked:** [denoland/celld](https://github.com/denoland/celld) **v0.6.3**  
- Wedged `during_call` N=100 — **0/100** `lost_midflight_intent`, **100/100** `callSent` (TTL=3000 disclosed).  
- Stale-owner SIGSTOP/CONT N=40 — **0/40** `staleSend`, **40/40** `ownershipMoved`, **0** lost intents (TTL=2000 disclosed).  
**ClawQL fleets:** measured boards moving to **stock 0.6.3** (claim evidence must match what we ship). Fork `0.4.0-clawql.*` retained for patches tip lacks (alive/ready).  
**License:** Apache-2.0  
**Contact:** short **question** to **ry@deno.com** (not a bug report — tip held both boards). PRs disabled; optional tiny format-patch only if they ask. Keep private until they respond.

Draft: [`upstream-report/BUG_REPORT_DRAFT.md`](upstream-report/BUG_REPORT_DRAFT.md)  
Evidence: `phased-n100-wedge-upstream-0.6.3.json`, `phased-n40-stale-owner-upstream-0.6.3.json`  
Probe design: [`upstream-report/STALE_OWNER_PROBE.md`](upstream-report/STALE_OWNER_PROBE.md)

## Filing posture

Tip already handles the wedged mid-flight path **and** the stale-owner-after-takeover path we probed. Do **not** file a bug led by “real on 0.4.0 with the gate off.” Ask whether Fleet proofs intentionally skip `VerifyOwnership`, and whether a small patch would be welcome — curiosity after clean boards, not a reproduction of tip loss.

## Optional patches (only if upstream wants them)

1. **Output gate VerifyOwnership for Fleet proofs too** (`crates/logic/output_gate.rs`).
2. **Epoch-current at confirm** before advancing `synced_seq` / returning from `await_durable`.
3. Availability (separate, ClawQL clawql.3): alive vs ready + bounded maintenance — tip 0.6.3 has no `/alive` yet.

## Contact

Human email to ry@deno.com (see draft). If upstream lands equivalent fencing, ClawQL unpins the fork and uses stock `celld.dev` install.
