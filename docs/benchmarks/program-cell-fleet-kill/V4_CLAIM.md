# v4 claim status

**Publish now:** v4 authorized (identity remesure).  
**Mechanism claim:** restored (lab build, scoped).  
Authorizing evidence: [`node-soak-lab-authorizing-mac-mini-identity-remeasure.json`](./node-soak-lab-authorizing-mac-mini-identity-remeasure.json) · [`phased-n1000-v4-mac-mini-ttl3000-identity-remeasure.json`](./phased-n1000-v4-mac-mini-ttl3000-identity-remeasure.json) · analysis [`mac-mini-v4-binary-authorization.json`](./mac-mini-v4-binary-authorization.json).

## Site claim (restored)

> **Zero wrong outcomes in 1,000 crash trials.** Measured on ClawQL's lab build of celld (0.6.3 plus supersede and expiry fixes), on one host, with a 3-second lease TTL. Soak and board share `celldLabGitCommit` `36d53565…` and `celldSha256` `5abb5d06…` in-artifact. During-call journaled intent was visible on recovery in **241/243** trials (2 `call_never_sent`, counted as availability). Availability: **18 of 1,000** trials (1.8%, under the 2% ceiling). Duplicates: 0.
>
> **Open items:** an earlier 3-second-TTL board recorded 2 lost intents in 100 trials. One was later classified as an injection miss (based on the journal, since the effect ledger wasn't kept); the other remains unexplained. Forced-latency tests are still in progress.

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
