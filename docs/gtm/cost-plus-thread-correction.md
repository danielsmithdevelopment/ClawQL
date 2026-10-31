# Cost Plus / X thread — correction (post now)

**Status:** mechanism claim paused until v3 proves durable-ack-before-send.  
**Action for human:** if the Cost Plus (or related durability) X thread already posted the “won’t double-charge” bullet, edit within the window or reply with the text below. If not posted yet, **drop that bullet**.

## Do not post / remove

- Interrupted orders are never blindly retried, so a crash won’t double-charge.
- Write intent is always saved before the call goes out (as an absolute).

## Safe reply / edit (copy-paste)

> Correction: we found a gap in our celld/R2 path where a mid-flight kill can leave the upstream call in flight without a durable write intent on storage. In that case resume can re-run the write — so “crash won’t double-charge” is **not** a claim we can make until the output-gate / lease-epoch fix is proven on a fresh board. The published zero-duplicate measurement still stands as a measurement; the mechanism sentence is paused. We’re treating this as a top priority and will restore the claim only after a corrected board with an automatic storage check passes.

## Website / video

- Live benchmarks honesty copy updated in `apps/www/src/lib/durability-benchmarks.ts` (outcome-unknown vs lost-intent).
- No in-repo durability explainer `VIDEO_SCRIPT` claimed intent-before-call; if an external video says intent is saved before the call, **stop promoting it** until re-rendered after v3.

## Related

- [publish-readiness](./publish-readiness.md) §1 caveat
- [during-call R2 settle](../benchmarks/program-cell-fleet-kill/during-call-404-r2-settle.json)
- [STATUS](../benchmarks/durability-proof/STATUS.md) mechanism note
