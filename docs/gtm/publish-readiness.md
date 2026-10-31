# Publish readiness — what you can say now

**Audience:** anyone writing public copy, a launch post, or outreach.  
**Rule:** ClawQL’s own results are ready. Competitor _comparisons_ wait. Cite competitors only as **their own claims**, linked.  
**Related:** [durability STATUS](../benchmarks/durability-proof/STATUS.md) · [golem honesty](./golem-overlap-and-durability-honesty.md) · [durable-execution claim path](./durable-execution-claim-path.md) · [program-density STATUS](../benchmarks/program-density/STATUS.md)

---

## 1. Ready to publish now

### Crash durability (flagship)

Evidence: [`phased-evidence.json`](../benchmarks/program-cell-fleet-kill/phased-evidence.json) · narrative [`AVAILABILITY.md`](../benchmarks/program-cell-fleet-kill/AVAILABILITY.md). Scope: **two celld nodes**, one storage provider (R2) — use the evidence’s own wording for backend and lease settings.

Suggested wording:

> Across 1,000 consecutive crashes injected at every phase of a write, ClawQL never repeated a write (95% upper bound about 0.3%). Recovery took about 12 seconds, set by the lease timeout. About 1.5% of trials missed availability, and safety held in all of them.

Unpack for longer copy:

| Fact                                   | Number                                                                               |
| -------------------------------------- | ------------------------------------------------------------------------------------ |
| Consecutive crashes, every write phase | **1,000**                                                                            |
| Repeated writes                        | **0** (95% upper bound ~0.3%)                                                        |
| Recovery (median)                      | **~12 s** (lease timeout)                                                            |
| Availability misses                    | **~1.5%** (~0.6% self-fence + ~0.9% resume deadline miss) — **liveness**, not safety |

### How writes are protected (product facts)

True by design and covered by tests — safe as product description, **except the intent-before-send durability caveat below**:

- Write **intent is journaled in the runner before** it *attempts* the call (host file-journal fsyncs; ProgramCellDO `await`s `storage.put`). **Caveat (2026-10-31):** on our pinned **celld 0.4.0** R2 fleets, five `during_call` trials showed the upstream hang open while intent was **not** in durable DO storage ([R2 settle](../benchmarks/program-cell-fleet-kill/during-call-404-r2-settle.json)) — ClawQL’s interleaving plus that pin could lose a pretends-journaled intent under node wedges. Stock **celld 0.6.3** (always-on gate) closed that path on wedged + stale-owner tip boards; **do not** restore the mechanism sentence until **v3 N=1000 on stock 0.6.3** finishes green. Credit upstream for the gate; own the 0.4.0 interleaving gap. Zero-duplicate boards remain a real measurement. Social correction: [cost-plus-thread-correction.md](./cost-plus-thread-correction.md).
- Approvals are **single-use**, bound to the approver’s key and the exact arguments, consumed before send; requester cannot approve their own request.
- A write interrupted mid-flight is **never retried blindly** — resolved by the API’s own mechanism where one exists, or marked **outcome unknown** for a person.
- Automatic resolution by API type:
  - **Idempotency keys:** key derived from the approval is resent → exactly once at the API.
  - **Lookup by reference:** after a crash, check whether the write landed, then done or safely resend.
  - **Neither:** never repeated; marked unknown.
- Race safety: a “not found” lookup counts only when one of three named server guarantees says the original can no longer land — never on a client timeout.
- **Model-checked under bounds** (TLA+): every crash point, node failover, network delay under stated bounds. Weaker designs (early “not found”, blind retry) produce counterexamples kept in the repo. Say **“model-checked under bounds,”** never “provably correct.”

### Density and deadlines (ClawQL-only lab)

Single host, disclosed, three repetitions where applicable. Mark: **“single host; cross-system comparison pending.”**  
Evidence: [`evidence-fair.json`](../benchmarks/program-density/evidence-fair.json) · [`drain-vs-sustained.json`](../benchmarks/program-density/drain-vs-sustained.json).

| Claim                         | Lab number                                                                                                                                       |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Parked agents @ ≤512 MiB RSS  | **~2.25e6** with 20-turn history, pending tool call, wake deadline (~0.22 KiB resident, ~32.8 KiB disk / agent); survived restart                |
| Wake p99 (median across reps) | **~0.19 ms** warm · **~1.4 ms** cold (cold range ~1.24–6.05 ms)                                                                                  |
| Durable deadline triggers     | **~312k/s** group-commit + fsync before “fired”; sustained equals drain within measurement error; crash test: every ack on disk, none duplicated |
| Bursts (1s SLA)               | **100k** co-timed all within 1s; first miss at **250k**                                                                                          |
| Schedule restart              | **~2.5e6** rebuild ~45–55 ms; overdue fired promptly; no loss / no duplicates                                                                    |

**Caveat (required):** parked state was written directly as parked bags, not produced by running turns through the runtime.

### Engineering write-ups (worth publishing)

1. **GC finding:** 2.5e6 object-per-entry schedule → major GC ~121 ms, steady tail ~314 ms; typed arrays → ~22 ms.
2. **Methodology corrections:** ramp steps too short (sustained can’t exceed drain); page-cache mistaken for durable; fsync ceiling must match the writer’s real pattern.
3. **Memory climb:** ~3.4 GB from orphaned SDK stream entries — fixed + CI gate; idle ~83 MB, lean floor ~142 MB, fast-path p50 ~1 ms.

---

## 2. Publish after maintainers review

Tip **schema v2** comparison package (stock celld **0.6.3**, new columns: runtime/version · intentPresentOnResume · callVerifiedSent) — ClawQL arms remasured; 0.4.0 rows superseded. Expansion pilots (peer four phases, wedge, stale-owner, lost-ack, neither-API, real-model Pi) at **N=50**, then maintainer config review, then **N=1000**. Hold named peer publish until John and Earendil answer “is this how you’d configure it?”

Until then, publicly: **a comparison package on tip 0.6.3 is underway; peer configs pending review.**

---

## 3. Safe to cite as _their_ claims (linked)

| Source              | Their statement (paraphrase — link the original)                                                                                                                                            |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Golem docs / stream | Interrupted outside request acts exactly once where the API honors its idempotency key; at least once otherwise. Remote side that doesn’t participate described as unsolvable on their end. |
| Pi Durable          | Tools marked safe are rerun after a crash; others reported interrupted for the agent to decide.                                                                                             |
| Infinity            | At-least-once delivery with input dedup; event provenance listed as open.                                                                                                                   |

Never present these as your measurements.

---

## 4. Never claim (yet, or at all)

| Forbidden                                                 | Say instead                                                                                                                                                                                          |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| “Exactly once” in general / “durable execution”           | “Never repeats a write,” plus exactly once _per API type_ where keys or lookups exist. Path to a named durable-execution level: [durable-execution-claim-path.md](./durable-execution-claim-path.md) |
| “Provably correct”                                        | “Model-checked under bounds”                                                                                                                                                                         |
| “Beats / safer / denser than” Golem, Pi Durable, Infinity | Wait for reviewed full comparisons                                                                                                                                                                   |
| Mid-step resumption / unmodified-agent durable processes  | Designs, not measurements                                                                                                                                                                            |
| Any Ontologiql numbers                                    | Private                                                                                                                                                                                              |

---

## Checklist before posting

- [ ] Flagship paragraph matches evidence scope (two nodes, R2, lease TTL).
- [ ] Availability costs (~1.5%) stated next to safety.
- [ ] Density marked single-host; parked-state caveat included.
- [ ] No “durable execution” / “exactly once” / “beats.”
- [ ] Competitor mentions are their claims or “comparison underway.”
- [ ] No Ontologiql figures.
