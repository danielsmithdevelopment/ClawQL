# Cost Plus / X thread — correction (post now)

**Status:** issue found, fixed, and verified at N=100 on the patched runtime (wedged `during_call`, call-sent proven); larger confirmation (v3 N=1,000 at stock lease TTL) underway before restoring the full mechanism claim.  
**Action for human:** post (or edit) the Cost Plus / related durability X thread with the reply below. Agents in this environment cannot post to X — paste when ready. If the original “won’t double-charge” bullet is still editable, replace it; otherwise reply.

## Do not post / remove

- Interrupted orders are never blindly retried, so a crash won’t double-charge.
- Write intent is always saved before the call goes out (as an absolute).

## Safe reply / edit (copy-paste)

> Correction: we found a gap in our celld/R2 path where a mid-flight kill could leave the upstream call in flight without a durable write intent — so “crash won’t double-charge” was not a claim we could keep. We fixed it on a patched celld (output gate + lease-epoch fence), verified at N=100 against a control that lost the intent every time (and confirmed every fenced trial still reached the call). A larger confirmation run at the stock lease timeout is underway; we’ll restore the mechanism claim — worded for the patched runtime with the gate on, including the measured cost of the gate — only after that board passes with an automatic storage check.

## Website / video

- Live benchmarks honesty copy updated in `apps/www/src/lib/durability-benchmarks.ts` (outcome-unknown vs lost-intent).
- No in-repo durability explainer `VIDEO_SCRIPT` claimed intent-before-call; if an external video says intent is saved before the call, **stop promoting it** until re-rendered after v3.

## Related

- [publish-readiness](./publish-readiness.md) §1 caveat  
- [during-call R2 settle](../benchmarks/program-cell-fleet-kill/during-call-404-r2-settle.json)  
- [STATUS](../benchmarks/durability-proof/STATUS.md) mechanism note  
- Fenced call-sent evidence: [`phased-n100-wedge-during-call-fenced.json`](../benchmarks/program-cell-fleet-kill/phased-n100-wedge-during-call-fenced.json)
