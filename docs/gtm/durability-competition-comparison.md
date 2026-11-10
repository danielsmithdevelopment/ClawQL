# Durability numbers vs competition (honest comparison)

**Status:** internal GTM honesty · recorded 2026-11-10 after v4 identity remesure  
**Audience:** anyone writing public copy, outreach, or investor/customer answers about crash-safety vs Temporal / Restate / DBOS / Inngest / peers  
**Related:** [`V4_CLAIM.md`](../benchmarks/program-cell-fleet-kill/V4_CLAIM.md) · [publish readiness](./publish-readiness.md) · [golem honesty](./golem-overlap-and-durability-honesty.md) · [Cloud plan](./clawql-cloud-platform-plan.md) · [comparison board](../benchmarks/durability-proof/COMPARISON.md)

---

## Verdict

Ahead on **published, reproducible crash evidence**; behind on **proven production scale**. Those are different kinds of claim. Do not mix them.

## Where ClawQL is behind: production proof

The incumbents' evidence is usage at enormous scale. Temporal reports a cumulative **9.1 trillion** action executions, **1.86 trillion** of them from AI-native companies, and OpenAI Codex uses Temporal to handle millions of daily coding-agent requests. It also shipped Multi-Region Replication to GA with a **99.99%** SLA. Production at that scale is the ultimate soak test.

ClawQL has **one lab host** and **no production users** yet. No crash board, however rigorous, substitutes for that.

## Where ClawQL is ahead: public, reproducible crash evidence

In what we have found, the major engines publish adoption figures, architecture descriptions, and SLAs, but **not** adversarial crash-injection boards: per-phase kills, frozen pass criteria, effect ledgers, and published failures. We cannot rule out that some exist, but they are not part of how these companies make their case.

Independent researchers are starting to probe this too: academic security teams published studies in August 2026 documenting real conformance violations and rollback attacks in agent checkpoint systems. That makes published, independently checkable crash evidence more valuable, not less.

ClawQL's authorizing remesure (2026-11-09): N=1000, identity-matched soak↔board, correctness 0, during-call intent settled against effect ledgers, open items kept beside the claim — see [`V4_CLAIM.md`](../benchmarks/program-cell-fleet-kill/V4_CLAIM.md).

## Where ClawQL may be ahead on substance: external writes

One comparison notes that in Temporal and Inngest, the engine guarantees a step's result is recorded once and replayed, but **not** that the underlying external write happened exactly once if a crash lands mid-call (after the side effect, before the journal write). That is exactly the window ClawQL's `during_call` and `after_call_before_journal` phases test, and what journaled intent plus idempotency keys address.

Those engines expect developers to make activities idempotent themselves; ClawQL enforces it at the gateway. That is a real, defensible difference — **as long as it is described precisely**, never as "they lose writes." Prefer: *they guarantee step replay; ClawQL governs mid-flight external effects with durable intent and at-most-once / keyed resume.*

See also [golem honesty — two kinds of durable](./golem-overlap-and-durability-honesty.md#two-kinds-of-durable-do-not-conflate).

## What you cannot claim yet

- **"Faster" or "more reliable" than any of them.** There are no same-harness numbers for them, and remesure recovery (self-fence resume p50 ≈17s with a 3s lease) would likely compare poorly on speed.
- **Anything from the Golem and Pi package.** It stays private until their maintainers have reviewed it, per the comparison-board rule ([`COMPARISON.md`](../benchmarks/durability-proof/COMPARISON.md)).

## The move that turns evidence into advantage

Run the **same harness** against Temporal, Restate, and DBOS. All three can be self-hosted. Invite their maintainers to review the configuration first, as with Executor. A public, reproducible, cross-engine crash board would be the first of its kind, and useful to the whole field whichever way the numbers fall.

Until that board exists: claim ClawQL's **measured lab crash-safety** (scoped build, open items beside), not superiority over engines whose primary evidence is production scale.
