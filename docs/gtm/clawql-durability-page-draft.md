# Durability page draft (`clawql.com/durability`)

**Status:** Draft for marketing site. Prepared 2026-11-11. Live route: [`apps/www/src/app/durability/page.tsx`](../../apps/www/src/app/durability/page.tsx). Numbers checked against evidence files on this date (see verification table).

**Related:** full tables on [`/benchmarks#durability`](https://clawql.com/benchmarks#durability); design wedges in [network whitepaper](../vision/clawql-network-whitepaper-v0.2.md) §§10–11, 28A.

---

# Durability

**What happens to an agent's work when a machine crashes in the middle of an action, and how we prove it.**

Agents don't just answer questions. They send payments, file records, update databases and call APIs that change the world. A crash at the wrong moment can make an agent do something twice, or lose track of what it already did. ClawQL is built so that neither happens, and this page shows the evidence, including where it is still incomplete.

## Two ways a crash goes wrong

- **A repeated action.** The agent sends a payment, crashes before recording that it did, restarts, and sends it again.
- **A lost intent.** The agent decides to act, but the record of that decision disappears in the crash, so after recovery nobody knows whether the action happened.

Most agent frameworks handle neither at the infrastructure level; they rely on each tool or developer to cope. ClawQL handles both underneath every tool call.

## How ClawQL prevents them

1. **Record the intent before acting.** Before any external call, the agent's intent is written to a durable journal. If the machine dies a moment later, the intent survives.
2. **Never acknowledge before it's durable.** Nothing is confirmed until a durability proof covers the write (disk quorum among fleet peers by default, or the object store in bucket mode). Acknowledging too early is exactly how intents get lost.
3. **Attach an idempotency key to every external write.** The key is derived from the journaled intent, so if a call is retried after a crash, the receiving service recognizes it as the same request and performs it once.
4. **One live owner per agent.** Each agent is owned by exactly one process at a time, through a lease. A process that falls behind is fenced off, so it cannot act on stale state.
5. **Silence is not death.** A lease running out does not mean its owner is dead; a frozen process can wake up. ClawQL only treats an owner as gone when it can prove it (for example, the process no longer exists on that host) or when it has fenced the old owner out.
6. **Uncertainty is explicit.** If a crash lands mid-call and ClawQL cannot know whether the call took effect, the outcome is recorded as unknown and resolved by checking, never by guessing or blindly retrying.

## What we measured

On ClawQL's lab build of the `celld` runtime (version 0.6.3 plus ClawQL's fixes), on one host, against a mock upstream service:

| Measurement | Result |
| --- | --- |
| Soak: repeated node restarts | 1,000 of 1,000 cycles, no failed readiness, no self-fencing |
| Crash trials, killed at every phase of an action | 1,000 trials |
| Wrong outcomes (repeated or lost actions) | **0** |
| Crashes during an external call where the intent was visible on recovery | 241 of 243; the other 2 never sent the call, confirmed by their effect records |
| Trials that missed the recovery deadline | 18 of 1,000 (1.8%, under our 2% limit) |
| Median recovery time | About 17 seconds |

Zero wrong outcomes in 1,000 trials means the true rate is at most about 0.3%, with 95% confidence. It does not mean never, and we say so.

The soak and the crash trials are proven, inside their own result files, to have run the same binary, identified by commit and SHA-256 hash.

**Why recovery takes 17 seconds.** An earlier build recovered in about 7, by treating an unresponsive owner as dead once its lease ran out. That was unsafe: a frozen owner can wake up and act. We now wait until the old owner is provably gone or fenced out. That makes recovery slower and correct, and we chose correct.

## How we test

- **Kill at every phase.** Each trial kills the agent at a chosen point: before recording intent, after recording it but before calling, during the call, and after the call but before recording the result. Every phase must end with the right outcome.
- **Hostile timing.** Owners are frozen past their leases, stale owners are revived, and renewals are made ambiguous, the conditions under which ownership bugs appear.
- **Ground truth outside the system.** Every trial keeps an independent record of what the receiving service actually did, so results never depend on the system grading itself.
- **Criteria fixed in advance.** Pass and fail criteria are frozen before a board runs and never loosened after seeing results. A run is voided only for a monitored environment fault recorded at the time.
- **Formal models.** Ownership, leases, resume and approval lifecycles are modeled in TLA+, and the model checker is used to find counterexamples before code changes.
- **Same binary, proven.** Result files record the exact build they ran, so a claim can't quietly mix evidence from different code.

## What went wrong along the way

We publish failures alongside passes, because the failures are how the system got here.

- **Lost intents.** Early boards found that acknowledging a write before it was durable could lose a recorded intent in a crash. The upstream runtime fixed this with an always-on output gate, and ClawQL moved to that release.
- **Expiry treated as death.** A lease running out was once enough to recover an owner's work, even while that owner was frozen rather than dead. The rule is now that expiry is never proof of death.
- **A grading bug.** Our own test harness once counted a timed-out status check as a lost intent. It now records those as unknown, and every reclassification is published side by side with the original.
- **Earlier boards that failed** (versions 1 to 3) remain published with their results.

## Durability mode on these boards

The soak and crash trials ran celld's default **`fleet`** mode: two nodes on **one host**, with Cloudflare R2 as the fleet bucket. Acknowledgments waited for a **peer disk proof** (or a racing bucket proof), not for “already in the object store.” Background upload to R2 continues after ack. That covers process and node crashes while disks on that host remain. Losing the host's disks, a whole availability zone, or a region is **not** what these boards measured. Full record: [`DURABILITY_MODE.md`](../benchmarks/program-cell-fleet-kill/DURABILITY_MODE.md).

## Still open

- **An unexplained result.** An earlier board with very short leases recorded 2 lost intents in 100 trials. One was later classified as a missed fault injection, based on the journal; the other remains unsettled.
- **Recovery time.** 17 seconds is the honest cost of fencing, and we want it lower without giving up correctness.
- **Scope.** These results are from one host, a lab build and a mock upstream service. Multi-host runs, the unmodified upstream runtime and real services are next.
- **Fault scope.** Zone- and region-loss boards, plus an explicit `CELLD_DURABILITY=bucket` arm (higher object-store request cost), are not yet measured.
- **What isn't covered.** Calls to services that don't accept idempotency keys can end with an unknown outcome that must be checked rather than retried. Containers' own internal state is not covered. ClawQL's own payment flows are not yet covered by these results.

## Beyond one machine

*Design work, not yet built or measured.* Whitepaper cross-links: [§10](../vision/clawql-network-whitepaper-v0.2.md#10-the-decentralized-path-the-provider-network), [§11](../vision/clawql-network-whitepaper-v0.2.md#11-clawql-cellrt-the-runtime-substrate), [§28A](../vision/clawql-network-whitepaper-v0.2.md#28a-governed-on-chain-actions).

- **Faster recovery without guessing.** When a service accepts idempotency keys, any replica could safely carry out an agent's recorded intent, so recovery would no longer wait for a lease to expire. This follows leaderless consensus designs such as QuePaxa, and will be modeled formally before it is built.
- **Agreement among parties who don't trust each other.** For networks of independently operated nodes, consensus that tolerates malicious participants: asynchronous DAG-based protocols that never depend on timeouts, and designs that use attested hardware to need fewer replicas.
- **On-chain actions.** A blockchain transaction's nonce can land only once, so it serves as a natural idempotency key: ClawQL journals the signed transaction before broadcasting and checks the chain before ever resending. Finality is tracked explicitly, including chain reorganizations.
- **An independent witness, optionally.** For customers who want proof that does not depend on ClawQL at all, decisions can be committed on-chain, executed through Chainlink's Runtime Environment with consensus and attested enclaves, or proven with zero-knowledge proofs. These are opt-in and never the default.

## Check it yourself

Everything above is reproducible from the public repository (links pinned to the commits that landed each artifact):

- Crash boards and evidence: [`docs/benchmarks/program-cell-fleet-kill/`](https://github.com/danielsmithdevelopment/ClawQL/tree/e7e2d8d11d2a0f81e98002730e3620eacccacb34/docs/benchmarks/program-cell-fleet-kill) (identity remesure board + soak at `e7e2d8d1`)
- Authorizing soak and the v4 board, with matching binary identity: branch [`v4-soak-mac-mini-20261106`](https://github.com/danielsmithdevelopment/ClawQL/tree/v4-soak-mac-mini-20261106); identity remesure JSON at commit [`e7e2d8d1`](https://github.com/danielsmithdevelopment/ClawQL/blob/e7e2d8d11d2a0f81e98002730e3620eacccacb34/docs/benchmarks/program-cell-fleet-kill/phased-n1000-v4-mac-mini-ttl3000-identity-remeasure.json)
- During-call settlement of the 2 trials: [`v4-identity-remeasure-during-call-settle.json`](https://github.com/danielsmithdevelopment/ClawQL/blob/de237c7681f87bdbcbef8e9dac0aa813ed8d9148/docs/benchmarks/program-cell-fleet-kill/v4-identity-remeasure-during-call-settle.json) (`de237c76`)
- Formal models: [`formal/tla/`](https://github.com/danielsmithdevelopment/ClawQL/tree/cadb0a4bcb7dd312663b9eea59ec1e49ff6c6ba6/formal/tla) (program resume, leases, mandates, payments)

---

## Notes for publishing

- [x] Verify every number against the evidence files at their pinned commits (2026-11-11 — see table below).
- [x] Replace repository paths with links pinned to commits (draft + live page).
- [x] Confirm the status of the payments write-ahead fix: **not landed** as of 2026-11-11 (`docs/gtm/clawql-cloud-platform-plan.md` still gates on Stripe write-ahead). Keep the "What isn't covered" payments line.
- [x] Cross-link from `/benchmarks`, and link back to it for the full tables.
- [x] "Beyond one machine" links to whitepaper §§10, 11, 28A.

### Number verification (2026-11-11)

| Claim | Source | Match |
| --- | --- | --- |
| Soak 1000/1000, 0 ready fails, 0 self-fences | `node-soak-lab-authorizing-mac-mini-identity-remeasure.json` · `cyclesCompleted=1000`, `readyFails=0`, `selfFences=0` | yes |
| Same binary soak↔board | both files · `celldLabGitCommit=36d53565…`, `celldSha256=5abb5d06…` | yes |
| Crash N=1000, 0 duplicates | remesure JSON · `n=1000`, `zeroDuplicates=true`, `gates.correctness.failures=0` | yes |
| During-call 241/243 intent visible; 2 never sent | remesure · `duringCallVerifiedSent=241`, `duringCallN=243`; settle JSON · both `call_never_sent`, `lost_midflight_intent=false` | yes |
| Availability 18/1000 (1.8%) | remesure · `gates.availability.failures=18`, `failureRate=0.018` | yes |
| Median recovery ~17s | settle · `okFenceResumeMsP50=17067` (successful self-fence resume p50); earlier board ~6.7s | yes |
| Rule-of-three ≤0.3% at N=1000 | standard 3/N upper bound | yes |
| Payments not covered | cloud platform plan: Stripe write-ahead still open | yes |

Binary identity (lab celld): commit `36d53565c8ffa6d31bb9dd39b6bcbac317c0629b`, sha256 `5abb5d06c3a4bd2f53b71475fa0d05574242978c60f830dc5e55edf52c86c47f`.
