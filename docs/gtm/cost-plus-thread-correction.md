# Cost Plus / X thread — correction (post now)

**Status:** gap found on pinned **0.4.0** + ClawQL mid-flight path; closed by upgrading to stock **celld 0.6.3** (always-on gate). Wedged N=100 and stale-owner N=40 on tip held; v3 N=1,000 at stock TTL underway before restoring the full mechanism claim.  
**Action for human:** post (or edit) the Cost Plus / related durability X thread with the reply below. Agents in this environment cannot post to X — paste when ready. If the original “won’t double-charge” bullet is still editable, replace it; otherwise reply.

## Do not post / remove

- Interrupted orders are never blindly retried, so a crash won’t double-charge.
- Write intent is always saved before the call goes out (as an absolute).
- “We found a bug in celld” / “we patched celld” as the public story.

## Safe reply / edit (copy-paste)

> Correction: on our pinned celld 0.4.0 setup, combined with how ClawQL interleaved reads and intent writes, a mid-flight node kill could leave the upstream call in flight without a durable write intent — so “crash won’t double-charge” was not a claim we could keep. Upgrading to stock celld 0.6.3, where the durability gate is always on, closed it. We verified with wedged-fleet and stale-owner boards (call-sent proven; no late stale-owner egress). A larger confirmation at the stock lease timeout is underway; we’ll restore the mechanism claim — worded for stock 0.6.3, including the measured gate wait — only after that board passes with an automatic storage check. Credit to upstream for the always-on gate.

## Website / video

- Live benchmarks honesty copy updated in `apps/www/src/lib/durability-benchmarks.ts` (outcome-unknown vs lost-intent).
- No in-repo durability explainer `VIDEO_SCRIPT` claimed intent-before-call; if an external video says intent is saved before the call, **stop promoting it** until re-rendered after v3.

## Related

- [publish-readiness](./publish-readiness.md) §1 caveat  
- [during-call R2 settle](../benchmarks/program-cell-fleet-kill/during-call-404-r2-settle.json)  
- [STATUS](../benchmarks/durability-proof/STATUS.md) mechanism note  
- Tip evidence: [`phased-n100-wedge-upstream-0.6.3.json`](../benchmarks/program-cell-fleet-kill/phased-n100-wedge-upstream-0.6.3.json), [`phased-n40-stale-owner-upstream-0.6.3.json`](../benchmarks/program-cell-fleet-kill/phased-n40-stale-owner-upstream-0.6.3.json)
