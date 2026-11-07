# v4 claim status

**Publish now:** v4 passed; authorization pending binary-identity remesure.  
**Mechanism claim:** paused.  
Evidence + analysis: [`mac-mini-v4-binary-authorization.json`](./mac-mini-v4-binary-authorization.json) · board [`phased-n1000-v4-mac-mini-ttl3000.json`](./phased-n1000-v4-mac-mini-ttl3000.json).

## What is real today

- Lab Mac mini Colima board N=1000 · `CELLD_TTL_MS=3000` · correctness **0** · availability **2/1000** · `during_call` callVerifiedSent **251/251** · durable intent visible **251/251** · missing-data + phase-validity **pass**.
- During-call kills were all `effects0` (in-flight before write commit). Do not imply that phase covered both effect outcomes; `after_call_before_journal` covers write-landed-not-journaled (0 duplicates there).

## What is not authorized yet

Soak↔v4 same-binary proof is missing from the artifacts (`celldSha256` / matching `celldLabGitCommit` on the v4 JSON). Conditional stories do not restore the flagship claim. Remesure: [`MAC_MINI_AGENT.md`](./MAC_MINI_AGENT.md) § identity remesure.

## After identity remesure (site draft — do not publish until remesure greens)

> **Zero wrong outcomes in 1,000 crash trials.** Measured on ClawQL's lab build of celld (0.6.3 plus supersede and expiry fixes), on one host, with a 3-second lease TTL. In every crash during an external call, the journaled intent was visible on recovery (251/251). Availability: 2 of 1,000 trials missed the recovery deadline.
>
> **Open items:** an earlier 3-second-TTL board recorded 2 lost intents in 100 trials. One was later classified as an injection miss (based on the journal, since the effect ledger wasn't kept); the other remains unexplained. Forced-latency tests are still in progress.
