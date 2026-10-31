# Draft — private email to ry@deno.com (regression-test offer)

**Status:** READY FOR HUMAN REVIEW — tip held wedged + stale-owner; no bug to file. Keep private until Deno responds.  
**To:** ry@deno.com  
**Subject:** celld 0.6.3 durability boards — wedged-fleet + stale-owner tests if useful  
**How:** short offer, not a bug report / not a large agent PR. PRs are disabled upstream. Emailing a patch assigns rights in it to Deno Land under your contribution terms.

---

Hi Ry —

We've been exercising celld durability on a two-node Cloudflare R2 fleet while merging celld into our Streams path. Two boards that match the failure modes the always-on gate (and ownership checks) exist to prevent:

1. **Wedged mid-flight** — hang readiness so the lease can move while the victim still has an outbound hang, require mock upstream `inFlight` before SIGKILL. Stock **v0.6.3** held **100/100** (`lost_midflight_intent` 0, call sent 100/100; board used `CELLD_TTL_MS=3000`, disclosed).
2. **Stale owner after takeover** — SIGSTOP victim → lazy `own.json` move → SIGCONT, watch for late egress. Stock **v0.6.3** held **40/40** (`staleSend` 0, ownership moved 40/40; board used `CELLD_TTL_MS=2000`, disclosed).

We're pinning ClawQL to stock 0.6.3 and dropping our temporary fork. If either recipe would be useful as a regression test while you merge celld into workerd, happy to share the harness (Node board + mock pets) or trim it to whatever shape you prefer. We'll keep this private until you've responded.

— ClawQL / Streams durability board

## Operator notes (not part of email)

- Do **not** lead with 0.4.0 `CELLD_OUTPUT_GATE=0` negative control.
- Do **not** ask about Fleet `VerifyOwnership` as an open bug — tip held; this is an offer of tests.
- Agents do not email; human sends when ready.
