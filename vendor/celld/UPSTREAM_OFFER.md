# Upstream offer — denoland/celld

**Tip checked:** [denoland/celld](https://github.com/denoland/celld) **v0.6.3** wedged `during_call` N=100 on R2 — **0/100** `lost_midflight_intent`, **100/100** `callSent.sawInFlight` (always-on gate).  
**Negative control:** vendored `v0.4.0` with `CELLD_OUTPUT_GATE=0` — **100/100** lost on the same board.  
**ClawQL fork:** `0.4.0-clawql.3` (fence + alive/ready) still used for ClawQL fleets until unpin.  
**License:** Apache-2.0  
**Submission path:** upstream **disables pull requests**. Short bug report first → optional small `git format-patch` to **ry@deno.com**. Emailing a patch assigns rights to Deno Land. Keep private until they respond.

Draft (ready for human send): [`upstream-report/BUG_REPORT_DRAFT.md`](upstream-report/BUG_REPORT_DRAFT.md)  
Evidence: `docs/benchmarks/program-cell-fleet-kill/phased-n100-wedge-upstream-0.6.3.json`

## Verdict for filing

The DO-compat hole was **real on 0.4.0 with the gate off**. **Stock v0.6.3’s always-on durability wait held** under the same wedged mid-flight kill board. File as a confirmed historical gap + tip confirmation, not as “tip still loses intents on this path.”

Optional residual (not required by the N=100 result): Fleet proofs still skip `VerifyOwnership` in `durable_reached`; epoch-at-confirm remains a hardening offer.

## Proposed patches (minimal, separate — only if upstream wants them)

1. **Output gate VerifyOwnership for Fleet proofs too** (`crates/logic/output_gate.rs`).
2. **Epoch-current at confirm** before advancing `synced_seq` / returning from `await_durable`.
3. **Fenced bucket ack** (optional / measurement-dependent PUT vs PUT+GET).
4. **Refuse live incarnation steal** / refuse node-log bundle PUT when epoch not Open.
5. Chaos-only (can stay ClawQL-side): `CELLD_WEDGE_HEALTH_FLAG`.
6. Availability (separate): alive vs ready + bounded maintenance (`0.4.0-clawql.3`).

## Contact

Human maintainer email to ry@deno.com (see draft). If upstream lands equivalent fencing, ClawQL will unpin the fork and return to stock `celld.dev` install.
