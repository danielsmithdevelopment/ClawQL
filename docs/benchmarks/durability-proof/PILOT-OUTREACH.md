# Durability peer pilot — outreach package

**Status:** open development; **no social/marketing promotion** until the review window closes  
**Review window:** feedback by **13 November 2026** (America/Los_Angeles) is included in the published version  
**Fixed reference (tag):** [`durability-pilot-v1`](https://github.com/danielsmithdevelopment/ClawQL/releases/tag/durability-pilot-v1) — use the tag, not a moving PR tip  
**PR (same content, open repo):** https://github.com/danielsmithdevelopment/ClawQL/pull/1432  
**Board:** [COMPARISON.md](./COMPARISON.md) · pinned [`comparison/PACKAGE-MANIFEST.json`](./comparison/PACKAGE-MANIFEST.json) · peer evidence [`comparison/evidence.json`](./comparison/evidence.json)  
**TLA+:** [`formal/tla/write-protocol/`](../../../formal/tla/write-protocol/) (pass + recorded counterexamples)

ClawQL is public by default — the harness and results are already in the open repo. What we are holding back is **announcement and promotion**. Before we promote, we want maintainer review.

N=1000 on the stable host waits on feedback from this package. Real-model Pi Durable can follow as an update; it does not change the setup under review.

**ClawQL-only companions** (crash-point rows, Tier F resume, trace conformance) are **context** — “how we test ourselves” — not part of the head-to-head comparison. Label them that way in the DM.

---

## Framing for the DM (open repo, held promotion)

Use language like this so “private” is not mistaken for “hidden”:

> Everything we do is developed in the open, so the harness and results are already in our public repo, but we haven't announced or promoted them. Before we do, we'd like your review: is your system configured the way you'd want? Anything you change by **13 November 2026** goes into the published version. Fixed snapshot: https://github.com/danielsmithdevelopment/ClawQL/releases/tag/durability-pilot-v1

---

## Ask both maintainers (two specific questions)

1. **Is your arm configured the way you’d want** for this crash-during-outside-write board (out of the box as measured)?
2. **Would you like your system run at the other crash points too** (before write sent / after ack / idle)? That invites cooperation and sets up the N=1000 three-way with configs already agreed.

Optional follow-ups if they engage: lookup reconciliation (OOTB vs write it yourself); whether our **definitive** = named server guarantee matches their in-flight treatment.

---

## Short note — John (Golem)

> Golem makes **execution** durable; ClawQL governs the **remote effects** neither of us claims a runtime can make durable alone — at most once, approved, audited. Everything we do is developed in the open — the harness and N=50 results are already in our public repo — but we haven't announced or promoted them. Before we do, we'd like your review. Snapshot: https://github.com/danielsmithdevelopment/ClawQL/releases/tag/durability-pilot-v1
>
> On a server that ignores keys, out-of-the-box Golem re-sends (N duplicates); ClawQL stays 0 duplicates / N unknown (intended when the API offers neither keys nor lookup — person resolves the unknown); with lookup-by-reference ClawQL completes 0/0/N. Race + TLA+ catch trusting “not found” too early. ClawQL-only crash-point / resume companions are how we test ourselves, not peer scores.
>
> Is this how you’d configure the Golem arm? Would you like Golem run at the other crash points too? Feedback by **13 November 2026** is included in the published version.

---

## Short note — Earendil (Pi Durable)

> Everything we do is developed in the open — the harness and N=50 results are already in our public repo — but we haven't announced or promoted them. Before we do, we'd like your review. Snapshot: https://github.com/danielsmithdevelopment/ClawQL/releases/tag/durability-pilot-v1
>
> We measured Pi Durable on a crash-during-outside-write board with faux never-retry / always-retry (real-model env-gated as a follow-up). With `replay: "unsafe"`, never-retry is 0 duplicates but N interrupted/unknown; always-retry against a non-idempotent mock is N duplicates — so the zero depends on the model. ClawQL’s structural gate stays 0 duplicates even when the model always retries. Companions (other crash points, resume-vs-journal, trace↔TLA+ checks) are our internal harness context.
>
> Is the faux never/always-retry matrix the setup you’d want? Would you like Pi run at the other crash points too? Feedback by **13 November 2026** is included in the published version.

---

## One-table summary (API type `neither`, outside-write, N=50)

| Arm (out of the box) | Never retries | Always retries |
| -------------------- | ------------- | -------------- |
| Pi Durable           | 0 / N / 0     | **N / 0 / 0**  |
| Golem                | **N / 0 / 0** | **N / 0 / 0**  |
| ClawQL               | 0 / N / 0     | **0 / N / 0**  |

Cells = duplicates / interrupted-or-unknown / completed-exactly-once.

ClawQL **0 / N / 0** on neither = intended (journal intent, refuse blind resend, mark unknown). ClawQL + lookup → **0 / 0 / N**. With zero duplicates in 50 trials, the **95% upper bound** on the true duplicate rate is about **6%** — a harness bound, not a rate claim until N=1000.

---

## Do not

- Post in John’s public durability thread / pile on / seek engagement on social.
- Publish a Golem-named marketing board before the review window closes.
- Claim “provably correct” — say **model-checked** under stated TLC bounds; cite weak + peer counterexamples.
- Quote crash-point N=50 zeros as a duplicate **rate** — say behaves as designed; fold into N=1000 later.
- Point reviewers at a moving PR tip — use tag `durability-pilot-v1`.
- Imply the work is secret — the repo is public; promotion is what’s held.
