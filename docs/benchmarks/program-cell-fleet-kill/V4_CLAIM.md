# v4 claim status

**Publish now:** v4 authorized (identity remesure).  
**Mechanism claim:** restored (lab build, scoped).  
Authorizing evidence: [`node-soak-lab-authorizing-mac-mini-identity-remeasure.json`](./node-soak-lab-authorizing-mac-mini-identity-remeasure.json) · [`phased-n1000-v4-mac-mini-ttl3000-identity-remeasure.json`](./phased-n1000-v4-mac-mini-ttl3000-identity-remeasure.json) · analysis [`mac-mini-v4-binary-authorization.json`](./mac-mini-v4-binary-authorization.json).

## Site claim (restored)

> **Zero wrong outcomes in 1,000 crash trials.** Measured on ClawQL's lab build of celld (0.6.3 plus supersede and expiry fixes), on one host, with a 3-second lease TTL. Soak and board share `celldLabGitCommit` `36d53565…` and `celldSha256` `5abb5d06…` in-artifact. During-call: **241/243** intent visible; **2 `call_never_sent`** (egress never left the node), settled via effect ledger as no effect and no lost intent — availability, not durability ([settle](./v4-identity-remeasure-during-call-settle.json)). Availability: **18 of 1,000** (1.8%, under the 2% ceiling). Duplicates: 0.
>
> **Open items:** an earlier 3-second-TTL board recorded 2 lost intents in 100 trials. One was later classified as an injection miss (based on the journal, since the effect ledger wasn't kept); the other remains unexplained. Forced-latency tests are still in progress.
>
> **Availability tradeoff:** remesure 1.8% vs first Mac mini board 0.2%. Successful trials with survivor self-fence: 19/1000, resume p50 ≈17s (first board resume p50 ≈6.7s) — consistent with expiry≠dead (wedged owners wait for fenced takeover). Of the 18 availability failures, 11 are `pause_failed` (injection/fetch) and only 6 are mid-flight phases; the fence-recovery tails on *passing* trials are the clearer correctness-over-speed cost.

## Numbers that authorize

| Check | Result |
| ----- | ------ |
| Soak | `measured_v4_ready`, 1000/1000, voided=false, 0/0 ready/fence |
| Board | ok, correctness 0, availability 18/1000, missingData+phaseValidity pass |
| Identity | commit+sha match soak↔board |
| Forensic | prior binary mtime 2026-11-06T20:51:40Z predates original soak capture; sha matches remesure |

## Honest caveats beside the claim

- Remesure availability **1.8%** is looser than the first Mac mini board’s **0.2%** (still under gate).
- During-call was **241× effects0** (in-flight before write commit) — do not imply both effect outcomes; `after_call_before_journal` covers write-landed-not-journaled.
- TTL3s published **2/100** remains open beside this claim; remesure does not close it.

## Next board (frozen criteria + product metric)

1. **Keep counting all `pause_failed` trials against availability** (11 of 18 on remesure). Relabeling harness injection failures afterward is the post-hoc move the frozen criteria exist to prevent. Fix injection reliability *before* the next run so the availability column sharpens on what the runtime itself does.
2. **Track recovery time as a product metric**, not a footnote. Remesure successful self-fence resume **p50 ≈17s** (first board ≈6.7s) with **`CELLD_TTL_MS=3000`** — more than waiting out the lease alone. Profile where the remaining time goes (fence handshake, readiness, harness waits) before 17s becomes a sales objection. Expiry≠dead is the deliberate correctness tradeoff; the excess over TTL is the open engineering question.

Cloud plan durability gate (met) and claims rule: [`../../gtm/clawql-cloud-platform-plan.md`](../../gtm/clawql-cloud-platform-plan.md).
