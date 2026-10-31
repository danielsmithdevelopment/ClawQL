# Draft — private email to ry@deno.com (do not send until 0.6.3 wedged board finishes)

**Status:** DRAFT. Keep private until Deno responds. Do not post publicly.  
**To:** ry@deno.com  
**Subject:** celld / Durable Objects output-gate gap under wedged mid-flight kill (reproduction + optional small patches)  
**How:** short bug report first; optional small `git format-patch` attachments (PRs are disabled upstream). Coding-agent authored — we can explain each line. Emailing a patch assigns rights in it to Deno Land under your contribution terms.

---

Hi Ry —

Short bug report against celld’s Durable Objects compatibility rule. Not a large agent PR.

## Compatibility framing (your rule)

celld’s README presents continuous bucket replication as the durable source of truth and nodes as replaceable. The compatibility page treats Durable Objects as the stateful core and states that a silent compatibility gap is a defect; known gaps are marked. Output-gate / outgoing-hold-until-storage-confirmed behavior is not listed among those known gaps.

On Cloudflare, Durable Objects hold outgoing messages until storage writes are confirmed. By celld’s own standard, missing that behavior under a mid-flight kill is a compatibility bug — we are applying that rule, not accusing misuse of the API. We also know this is still alpha; gaps are expected, and we are not asking for a rush.

## Reproduction (narrow)

Two-node celld fleet on Cloudflare R2. Board: only `during_call` kills, with readiness hung first (`/.well-known/celld/health`) so the lease can move while the victim still runs the outbound hang, then SIGKILL. We require mock-upstream `inFlight` before the kill so the trial actually sent the call after durable ack (not a gate that blocked send).

| Build | Gate | Result |
| ----- | ---- | ------ |
| Vendored **0.4.0** with gate off (`CELLD_OUTPUT_GATE=0`) — negative control | off | **100/100** `lost_midflight_intent` |
| Same board, ClawQL patches (VerifyOwnership on Fleet proofs + epoch-at-confirm) | on | **0/100** lost; **100/100** `callSent.sawInFlight`; resume `outcome_unknown` with intent visible |

So the harness reproduces a real hole when the gate is off / incomplete, and a small fence closes it without blocking send.

### Latest upstream check (required before filing)

Same wedged board against **stock celld v0.6.3** (always-on durability wait; `CELLD_OUTPUT_GATE` removed). Chaos-only change for the board: hang readiness while a flag file exists (not a durability patch). Fill when N=100 finishes:

- **v0.6.3 wedged N=100:** `_pending_` (`lost_midflight_intent` / `callSent.sawInFlight`)

If 0.6.3 already holds (0 lost, 100/100 call-sent), we will say so plainly and only offer optional hardening below. If it still loses intents, the report is on current tip.

## Optional patches (small, separate)

If useful, two small `git format-patch` attachments (coding-agent authored; we can walk each line):

1. **Output gate:** run `VerifyOwnership` for Fleet proofs as well as Bucket (today Fleet settles without the ownership read — see `crates/logic/output_gate.rs` `durable_reached`).
2. **Epoch-at-confirm:** before advancing `synced_seq` / returning from `await_durable`, re-check that `own.json` still names this node at the resident epoch.

We understand emailing a patch assigns rights in it to Deno Land under your contribution terms.

Context only (not a pitch): Cloudflare’s announced Deno acquisition and plan to merge Celld with Workerd make DO durability semantics load-bearing for the self-hosted Workers story; we are filing this as a narrow compatibility report.

Happy to answer questions or trim further. We will keep this private until you have responded.

— ClawQL / Streams durability board

## Attachments (when sending)

- `0001-output-gate-verify-ownership-fleet.patch` (optional; only if still relevant after 0.6.3 result)
- `0002-ltx-epoch-at-confirm-fenced-ack.patch` (optional)
- Evidence summary inline only (keep the email short)

## Operator checklist (ClawQL — not part of email)

- [ ] Wait for `phased-n100-wedge-upstream-0.6.3.json` status complete
- [ ] Fill the 0.6.3 row; if 0/100 lost, lead with “fixed on tip” + optional Fleet VerifyOwnership note
- [ ] If losses remain, attach the two small patches against denoland/celld @ the tested tag
- [ ] Human sends to ry@deno.com — agents do not email
- [ ] Keep private until Deno responds; no public write-up until then
