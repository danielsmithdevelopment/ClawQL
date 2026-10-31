# Upstream offer — denoland/celld

**Tip checked:** [denoland/celld](https://github.com/denoland/celld) **v0.6.3**  
- Wedged `during_call` N=100 — **0/100** `lost_midflight_intent`, **100/100** `callSent` (`CELLD_TTL_MS=3000` disclosed).  
- Stale-owner SIGSTOP/CONT N=40 — **0/40** `staleSend`, **40/40** `ownershipMoved`, **0** lost intents (`CELLD_TTL_MS=2000` disclosed).  

**ClawQL fleets:** product pin is **stock 0.6.3** (no fork). Claim evidence must match that binary.  
**License:** Apache-2.0  
**Contact:** short **regression-test offer** to **ry@deno.com** (not a bug report, not a VerifyOwnership question). Keep private until they respond. Human sends.

Draft: [`upstream-report/BUG_REPORT_DRAFT.md`](upstream-report/BUG_REPORT_DRAFT.md)  
Evidence: `phased-n100-wedge-upstream-0.6.3.json`, `phased-n40-stale-owner-upstream-0.6.3.json`  
Probe design: [`upstream-report/STALE_OWNER_PROBE.md`](upstream-report/STALE_OWNER_PROBE.md)

## Filing posture

Tip already handles the failure modes the always-on gate exists to prevent. Offer the **wedged-fleet** and **stale-owner** boards as optional regression tests for the workerd merge — genuine contribution, low cost to them.

## Contact

Human email to ry@deno.com (see draft). Agents do not email.
