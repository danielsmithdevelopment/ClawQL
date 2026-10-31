# Draft — private email to ry@deno.com (short question; not a bug report)

**Status:** READY FOR HUMAN REVIEW — tip wedged board held; no tip failure to report. Keep private until Deno responds.  
**To:** ry@deno.com  
**Subject:** celld durability under node wedges — always-on gate on 0.6.3 + one code question  
**How:** short question, not a bug report / not a large agent PR. PRs are disabled upstream. Optional tiny format-patch only if you say a change would be welcome. Emailing a patch assigns rights in it to Deno Land under your contribution terms.

---

Hi Ry —

We've been testing celld durability under node wedges on a two-node Cloudflare R2 fleet (hang readiness so the lease can move while the victim still runs an outbound hang, then SIGKILL mid-call). We require the mock upstream to see `inFlight` before the kill so the trial actually sent after durable ack.

**Stock celld v0.6.3** held in **all 100** trials of that wedged-fleet board (`lost_midflight_intent` 0/100, call sent 100/100). Nice work on the always-on durability wait. (Disclosure: that board used `CELLD_TTL_MS=3000` for faster lease move under wedge — not stock 10s.)

Reading `crates/logic/output_gate.rs` `durable_reached`, the **Fleet** proof path still settles without the `VerifyOwnership` read that **Bucket** proofs get. Is that intentional (fleet arbitration is enough even when a member is wedged rather than sealed), or would a small patch that also verifies ownership on Fleet proofs be welcome?

Happy to share the board recipe or a minimal patch if useful. We'll keep this private until you've responded.

— ClawQL / Streams durability board

## Operator notes (not part of email)

- Do **not** lead with 0.4.0 `CELLD_OUTPUT_GATE=0` negative control — that is an old release with the safety feature deliberately disabled.
- Dedicated **stale-owner** probe (old owner still writing after takeover, aimed at the Fleet skip) is still outstanding; if it loses intents on tip, upgrade this to a real bug report with stock reproduction before sending — or send a follow-up.
- Agents do not email; human sends when ready.
