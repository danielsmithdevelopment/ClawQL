# Live peer adapters — PR #1432 reference (schema v1)

**Provenance:** unmerged PR [#1432](https://github.com/danielsmithdevelopment/ClawQL/pull/1432) (`cursor/durability-peer-pilot-f425`), notably:

- `50ff36079` — replace peer stand-ins with live Golem + Pi Durable (`DURABILITY_COMPARISON_LIVE_PEERS=1`)
- Tip evidence: `docs/benchmarks/durability-proof/comparison/archive/evidence-pr1432-live-peers-n50.json` (Golem / Pi always-retry / combos measured at N=50)

**Why not on the tip board yet:** tip package is **schema v2** (`intentPresentOnResume`, `callVerifiedSent`, `crashPhase` rows, `harnessCommit`). These drivers target the v1 fairness board types (`harnessValid`, agent-policy arm ids). They are the adapters to **rewire**, not to replace with model-sims.

**Rewire checklist**

1. Port `peer-live-arms.ts` (+ `metrics.ts`, Pi kill worker, Golem fixture under `../golem-write-pilot/`) onto schema v2 `types.ts`.
2. Map arm ids: `golem`, `pi-durable` (+ never/always/real policy rows or `agentPolicy` field), `golem+clawql`, `pi-durable+clawql`.
3. Fill `runtime` / `runtimeVersion` / `harnessCommit` / `crashPhase: "during_call"` / intent + callSent columns.
4. Default board stays `pending_adapter` until `DURABILITY_COMPARISON_LIVE_PEERS=1` remasure on tip commit.
5. Do **not** publish named peer rows on `/benchmarks` until maintainers review.

Do not treat `golem-at-least-once-sim` / `pi-interrupt-sim` as substitutes for these drivers.
