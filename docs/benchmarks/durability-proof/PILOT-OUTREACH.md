# Durability peer pilot — outreach package

**Status:** ready to send privately (not a public dunk)  
**PR:** https://github.com/danielsmithdevelopment/ClawQL/pull/1432  
**Board:** [COMPARISON.md](./COMPARISON.md) · evidence [`comparison/evidence.json`](./comparison/evidence.json)  
**TLA+:** [`formal/tla/write-protocol/`](../../../formal/tla/write-protocol/) (pass + recorded counterexamples)

N=1000 on the stable host waits on feedback from this package. Real-model Pi Durable can follow as an update; it does not change the setup under review.

---

## Ask both maintainers

1. Is this how you’d configure your arm for a crash-during-outside-write board?
2. For APIs with **neither** keys nor lookup: do you agree the honest floor is duplicates (retry/re-send) vs ClawQL’s 0 dups / unknown?
3. For **lookup-by-reference**: would you add reconciliation in user code (Golem transaction helpers / Pi agent policy), or is “out of the box” the right comparison?
4. Does our definition of **definitive** (server-enforced expiry / lookup-covers-prior-accepts / connection-rejected — never client timeout alone) match how you’d treat in-flight requests?

---

## Short note — John (Golem)

> Golem makes **execution** durable; ClawQL governs the **remote effects** neither of us claims a runtime can make durable alone — at most once, approved, audited. We measured a crash-during-outside-write board (out of the box) vs Golem + Pi Durable: on a server that ignores keys, Golem re-sends (N duplicates); ClawQL stays 0 duplicates / N unknown; with lookup-by-reference ClawQL completes 0/0/N. Race + TLA+ catch trusting “not found” too early.
>
> PR + board: https://github.com/danielsmithdevelopment/ClawQL/pull/1432  
> COMPARISON: https://github.com/danielsmithdevelopment/ClawQL/blob/cursor/durability-peer-pilot-f425/docs/benchmarks/durability-proof/COMPARISON.md
>
> Is this how you’d configure the Golem arm? Is there a setup you’d use for the lookup case, or is “write the reconciliation yourself” the right answer?

---

## Short note — Earendil (Pi Durable)

> We measured Pi Durable on a crash-during-outside-write board with three agent policies: never-retry (faux), always-retry (faux), and real-model (env-gated, coming as a follow-up). With `replay: "unsafe"`, never-retry is 0 duplicates but N interrupted/unknown; always-retry against a non-idempotent mock is N duplicates — so the zero depends on the model. ClawQL’s structural gate stays 0 duplicates even when the model always retries.
>
> PR + board: https://github.com/danielsmithdevelopment/ClawQL/pull/1432  
> COMPARISON: https://github.com/danielsmithdevelopment/ClawQL/blob/cursor/durability-peer-pilot-f425/docs/benchmarks/durability-proof/COMPARISON.md
>
> Is the faux never/always-retry matrix the setup you’d want for outreach? Prefer we lead with a live-model arm once we have a key?

---

## One-table summary (API type `neither`)

| Arm (out of the box) | Never retries | Always retries |
| -------------------- | ------------- | -------------- |
| Pi Durable           | 0 / N / 0     | **N / 0 / 0**  |
| Golem                | **N / 0 / 0** | **N / 0 / 0**  |
| ClawQL               | 0 / N / 0     | **0 / N / 0**  |

Cells = duplicates / interrupted-or-unknown / completed-exactly-once.

ClawQL + lookup-by-reference → **0 / 0 / N**. Race probe (paused charge) → 0 duplicates while unknown until a **named** server guarantee.

---

## Do not

- Post in John’s public durability thread / pile on.
- Publish a Golem-named marketing board before this private check.
- Claim “provably correct” — say **model-checked** under stated TLC bounds; cite weak + peer counterexamples.
