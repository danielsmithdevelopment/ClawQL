# Draft — private email to ry@deno.com (do not send until 0.6.3 wedged board finishes)

**Status:** DRAFT. Keep private until Deno responds.  
**To:** ry@deno.com  
**Subject:** celld / Durable Objects output-gate gap under wedged mid-flight kill (reproduction + optional small patches)

---

Hi Ry —

This is a short bug report against celld’s Durable Objects compatibility rule, not a large agent PR.

## Compatibility framing

celld’s own docs treat the bucket as the durable source of truth and say a silent DO compatibility gap is a bug. On Cloudflare, Durable Objects hold outgoing work until storage writes are confirmed. Output gates are not listed among celld’s known gaps. We hit a case where a mid-flight kill left an upstream call in flight without a survivor-readable write intent — by that compatibility rule, we believe that is a bug. We also know celld is still alpha; gaps are expected, and we are not asking for a rush.

## Reproduction (narrow)

Two-node celld fleet on Cloudflare R2. Focused board: only `during_call` kills, with `/.well-known/celld/health` hung first so the lease can move while the victim still runs the outbound hang, then SIGKILL.

| Build | Gate | Result |
| ----- | ---- | ------ |
| Vendored **0.4.0** with `CELLD_OUTPUT_GATE=0` (negative control) | off | **100/100** lost mid-flight intent |
| Same board, ClawQL patches (epoch-at-confirm + VerifyOwnership on Fleet proofs too) | on | **0/100** lost; every trial reached mock upstream `inFlight` before kill, then resumed `outcome_unknown` with intent visible |

So the harness reproduces a real hole when the gate is off / incomplete, and a small fence closes it without blocking send.

### Latest upstream check (required before filing)

We are re-running the **same wedged board** against **stock celld **v0.6.3**** (always-on durability wait; `CELLD_OUTPUT_GATE` removed). Chaos-only change for the board: hang readiness while a flag file exists (not a durability patch). Results will be filled here when the N=100 arm finishes:

- **v0.6.3 wedged N=100:** `_pending_` (`lost_midflight_intent` / `callSent`)

If 0.6.3 already holds, we will say so plainly and only offer optional hardening. If it still loses intents, the report is stronger on current tip.

## Scope of optional patches (small, separate)

If useful, we can follow with two **small** `git format-patch` attachments (coding-agent authored; we can explain each line):

1. **Output gate:** run `VerifyOwnership` for Fleet proofs as well as Bucket (today Fleet settles without the ownership read).
2. **Epoch-at-confirm:** before advancing `synced_seq` / returning from `await_durable`, re-check that `own.json` still names this node at the resident epoch.

We understand emailing a patch assigns rights in it to Deno Land under your contribution terms.

Context only (not a pitch): with Cloudflare acquiring Deno and planning to merge Celld with Workerd, DO durability semantics seem especially load-bearing; we are filing this as a compatibility bug report, not a marketing ask.

Happy to answer questions or trim further. We will keep this private until you have responded.

— ClawQL / Streams durability board

## Attachments (when sending)

- `0001-output-gate-verify-ownership-fleet.patch` (optional)
- `0002-ltx-epoch-at-confirm-fenced-ack.patch` (optional)
- Evidence JSON links or inline summary only (keep the email short)
