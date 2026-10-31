# Draft — private email to ry@deno.com (ready for human send; do not post publicly)

**Status:** READY FOR HUMAN REVIEW — tip check complete. Keep private until Deno responds.  
**To:** ry@deno.com  
**Subject:** celld output-gate / DO-compat: real on 0.4.0 gate-off; held on v0.6.3 always-gate (wedged N=100)  
**How:** short bug report first; optional small `git format-patch` only if you want the residual Fleet-proof hardening. PRs are disabled upstream. Coding-agent authored notes — we can explain each line. Emailing a patch assigns rights in it to Deno Land under your contribution terms.

---

Hi Ry —

Short note against celld’s Durable Objects compatibility rule. Not a large agent PR.

## Compatibility framing (your rule)

celld’s README presents continuous bucket replication as the durable source of truth and nodes as replaceable. The compatibility page treats Durable Objects as the stateful core and states that a silent compatibility gap is a defect; known gaps are marked. Output-gate / outgoing-hold-until-storage-confirmed behavior is not listed among those known gaps.

On Cloudflare, Durable Objects hold outgoing messages until storage writes are confirmed. By that standard, releasing outbound work without a survivor-readable durable write under a mid-flight kill is a compatibility bug — we are applying your rule, not accusing API misuse. We also know this is still alpha; gaps are expected, and we are not asking for a rush.

## Reproduction (narrow)

Two-node celld fleet on Cloudflare R2. Board: only `during_call` kills, with readiness hung first so the lease can move while the victim still runs the outbound hang, then SIGKILL. We require mock-upstream `inFlight` before the kill so the trial actually sent the call after durable ack (not a gate that blocked send).

| Build | Gate | Result |
| ----- | ---- | ------ |
| Vendored **0.4.0** with gate off (`CELLD_OUTPUT_GATE=0`) — negative control | off | **100/100** `lost_midflight_intent` |
| Same board, ClawQL patches (VerifyOwnership on Fleet proofs + epoch-at-confirm) | on | **0/100** lost; **100/100** `callSent.sawInFlight` |
| **Stock celld v0.6.3** (always-on durability wait; `CELLD_OUTPUT_GATE` removed). Chaos-only: hang readiness via flag file | always-on | **0/100** lost; **100/100** `callSent.sawInFlight`; avail failures 0; resumeMs p50≈6.0s / p99≈6.4s (`CELLD_TTL_MS=3000` for the wedge board) |

So the hole was real when the gate was off / incomplete on 0.4.0, and **current tip’s always-on gate held under the same wedged board**. We are filing this so you have the negative-control evidence and the tip confirmation — not to claim tip is still broken on this path.

## Optional residual hardening (only if useful)

On tip, `durable_reached` still runs `VerifyOwnership` for **Bucket** proofs only; Fleet proofs settle without the ownership read (`crates/logic/output_gate.rs`). A wedged (not sealed) member may still be an interesting path for epoch-at-confirm / Fleet VerifyOwnership. We are **not** claiming that residual under the N=100 wedged board — tip held without it.

If you want them, we can follow with two small, separate `git format-patch` attachments (coding-agent authored; we can walk each line):

1. **Output gate:** `VerifyOwnership` for Fleet proofs as well as Bucket.
2. **Epoch-at-confirm:** before advancing `synced_seq` / returning from `await_durable`, re-check that `own.json` still names this node at the resident epoch.

We understand emailing a patch assigns rights in it to Deno Land under your contribution terms.

Context only (not a pitch): Cloudflare’s announced Deno acquisition and plan to merge Celld with Workerd make DO durability semantics load-bearing for the self-hosted Workers story; we are filing this as a narrow compatibility note.

Happy to answer questions or trim further. We will keep this private until you have responded.

— ClawQL / Streams durability board

## Attachments (only if you ask for the optional hardening)

- `0001-output-gate-verify-ownership-fleet.patch`
- `0002-ltx-epoch-at-confirm-fenced-ack.patch`

## Operator checklist (ClawQL — not part of email)

- [x] `phased-n100-wedge-upstream-0.6.3.json` status `measured`, ok=true
- [x] Fill 0.6.3 row: **0/100 lost**, **100/100 callSent**
- [x] Lead with tip held; optional Fleet VerifyOwnership only
- [ ] Human sends to ry@deno.com — agents do not email
- [ ] Keep private until Deno responds
