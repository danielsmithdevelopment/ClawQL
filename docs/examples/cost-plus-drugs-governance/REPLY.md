# Reply draft — Mark Cuban / Cost Plus Drugs thread

**Not medical advice. Do not claim affiliation until they engage.**

Use after recording a short screen video of `./scripts/smoke.sh` and/or
`node scripts/gateway-smoke.mjs` (keep `CPD_GW_KEEP=1` if you want the gateway
up during the recording).

## Suggested X reply (short)

> You’ve already shipped the hard-to-find piece: a public, read-only pricing MCP.
> What’s left is the consequential side — refills/orders across Claude, ChatGPT,
> Grok, etc. without letting a model place an order or see patient data unless a
> human approves the exact drug/qty/price, with a full audit trail.
>
> Built a small ClawQL demo that keeps your MCP for reads, parks mock writes for
> patient approval, and redacts PHI toward non-BAA providers. Happy to walk your
> team through it — scoped pilot, public prices only until BAAs are in place.
> @elonmusk tag optional; lead with the video, not equity.

## Video narration (60–90s)

1. **Setup (5s):** “Cost Plus already exposes live cash prices over MCP. ClawQL
   is the governed gateway in front of it.”
2. **Read (15s):** Search atorvastatin 20mg through ClawQL → live CPD price.
   Mention token win: targeted search vs dumping the full catalog (~900× smaller).
3. **Write gate (25s):** “Refill my atorvastatin” → `mandate_required`. Show the
   digest / execution id. Agent cannot self-approve.
4. **Human approve (15s):** Patient/operator resumes → mock order lands, labeled
   MOCK, bound to NDC/qty/price. “No public ordering API — this write is a stub.”
5. **Safety close (15s):** “Same integration from any model. PHI only to
   BAA-covered providers. Everything audited. Prescription still comes from a
   doctor — we never give dosing advice.”

## What not to say

- No “HIPAA certified”
- No equity / advisor shares in the first reply
- No clinical recommendations or “you should take…”
- No implication that Cost Plus accepted a real order from the demo

## Parallel track

Incorporate the Delaware C-Corp (and advisor agreement template) while waiting
on a reply so a concrete offer is ready if they engage.
