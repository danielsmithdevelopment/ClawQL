---
title: "Correctness by construction — NASA Power of 10, SPARK Ada, Effect-TS, Rust + TLA+"
status: "Draft · August 2026"
applies_to: "clawql-tee · clawql-cellrt · clawql-streams · clawql-ouroboros · Effect packages · OpenBench / LAB gates"
companions: "docs/security/security-ontology-knowledge-loop.md · docs/benchmarks/harvey-lab-campaign-memory.md"
---

# Correctness by construction — NASA, SPARK, Effect-TS, Rust

**August 2026 · Draft**

**Related:** [clawql-tee](../streams/clawql-tee.md) · [clawql-cellrt](../streams/clawql-cellrt.md) · [clawql-streams](../streams/clawql-streams.md) · [Effect rearchitecture](./effect-ts-modularization-rearchitecture-plan.md) · [Ouroboros](../ouroboros/clawql-ouroboros.md) · [Security↔ontology loop](../security/security-ontology-knowledge-loop.md) · [LAB campaign memory](../benchmarks/harvey-lab-campaign-memory.md)

This note consolidates transferable lessons from:

1. **NASA / JPL Power of 10** (Gerard Holzmann) — pragmatic rules for reliable C
2. **Shuttle-era process discipline** (IBM Federal Systems — extremely low defect density via specs, independent review, defect-driven process)
3. **Ada / SPARK** — contracts, information flow, Ravenscar-style concurrency
4. **What Effect-TS already buys on the TypeScript side**
5. **What safe Rust + TLA+/Alloy buy on the cellrt/tee side**

**Thesis (shared with Jane Street / OxCaml-style thinking):** do not rely on programmer discipline. Make incorrect states **unrepresentable**, **uncompilable**, **unpromotable**, or **exhaustively ruled out** — preferably before code exists.

Clarification: “ColdFusion” in casual recall almost always meant **this aerospace correctness culture** (or **Ada/SPARK**), not Adobe ColdFusion.

---

## 1. One principle, four layers

| Layer           | Mechanism                                                           | Catches                        |
| --------------- | ------------------------------------------------------------------- | ------------------------------ |
| **Spec**        | Preconditions / postconditions / invariants written **before** code | Wrong requirements             |
| **Types**       | Effect `E`/`R`/`Schema`; Rust ownership, enums, newtypes            | Invalid states at compile time |
| **Runtime**     | `assert!`, promotion gates, required spend caps                     | Bad data that slipped types    |
| **Model check** | TLA+ / Alloy on critical global properties                          | Paths no test thought to run   |

Promotion gates, three-arm OpenBench, hallucination→findings, ATR gates, and Constitutional Wonder/Reflect are the **same idea** at different altitudes: proceed only on verified data.

---

## 2. NASA Power of 10 → ClawQL

Language-agnostic takeaways (full list is Holzmann’s; map the ones that bite agent systems):

| Rule (spirit)                            | ClawQL application                                                                                                                                                          |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Bounded loops**                        | Streams / Ouroboros / LAB: `maxTurns`, `budgetTokens`, wall clock — **required**, not optional defaults. Unbounded `stream_subscribe` ≡ unbounded flight loop.              |
| **Assertions as executable specs**       | ≥ meaningful pre/post checks on cell transitions, WORM append, key issue/expire — not only in tests. Rust: `assert!` / `debug_assert!`. System-level twin: promotion gates. |
| **Check all returns**                    | Failed WORM / LTX ack → **halt the cell** (or hard fail the request). Do not “log and continue” after audit write failure. `#[must_use]` + Effect typed errors.             |
| **No dynamic alloc after init (spirit)** | Pre-size WASM/token buffers; cell **pools** with known max resident cells (`CELLD_MAX_RESIDENT_CELLS` / tee equivalents). Predictable resource ceiling.                     |
| **Smallest scope**                       | ATR + WIT: grant only what this task needs. Broad subscription scopes that leak into every session ≡ globals.                                                               |
| **Warnings as errors**                   | Already CI culture; keep for Rust + TS.                                                                                                                                     |

**Shuttle process lessons (not just coding rules):**

- Spec is **what must be true**, written before build — not post-hoc documentation of what shipped.
- Every defect improves the **process** (B-7.1 keyword 0 → structured filters was correct shuttle discipline).
- Independent verification is structural (OpenBench three-arm / no-memory arm), not optional.

**Formal methods selectively:** do not SPARK-verify all of ClawQL. Prove / model-check the few invariants whose failure destroys the product claim (below).

---

## 3. Ada / SPARK → ClawQL

| SPARK idea                  | ClawQL form                                                                                                       |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| **Design by Contract**      | Specs + Effect Schema decode + Rust newtypes + runtime asserts                                                    |
| **Information flow**        | ATR claims + WIT world + Effect `R` channel (visible deps; not fully proved)                                      |
| **Ravenscar**               | No unbounded spawn after init; pre-allocated cell/fiber pools; bounded blocking                                   |
| **Correct by construction** | Prefer proof/model for key uniqueness, WORM append-only, cell liveness                                            |
| **Cost of late bugs**       | Demoted LAB traces / failed OpenBench cells = late discoveries — catch at gates, not in training data or prod TEE |

---

## 4. Effect-TS (TypeScript side) — honest map

Already in ClawQL’s direction ([Effect rearchitecture](./effect-ts-modularization-rearchitecture-plan.md)):

| Goal                          | Effect mechanism                                             | Strength                                         |
| ----------------------------- | ------------------------------------------------------------ | ------------------------------------------------ |
| Preconditions / typed failure | `Effect<A, E, R>` + `Effect.fail`                            | Callers must handle `E` — runtime, not proved    |
| Data contracts                | `effect/Schema` at MCP / ontology / QR / tool-arg boundaries | Best DbC for untrusted input                     |
| Capability-ish DI             | `Layer` / `Context` in `R`                                   | Dependencies visible; not information-flow proof |
| Structured concurrency        | Fibers / cooperative yield                                   | Predictable interleaving vs raw preempt          |
| Shared mutable safety         | `Ref` / `STM`                                                | Budget deduct under concurrency                  |

**Gaps Effect cannot close:** liveness (every Spawning→Dead), exhaustive global state (fleet-wide key uniqueness), loop termination as a type property. Those need **TLA+/Alloy at design time** (or equivalent), then Effect/Rust implement the model.

**Practical Effect bar for ClawQL TS:**

1. Schema-decode all external boundaries (ontology fields, tool args, stream frames).
2. Put Vault / WORM / ATR clients in `R` — no ambient smuggling.
3. STM/Ref for virtual-key / budget enforcement under concurrency.
4. Required caps on every evolutionary / stream consumer loop (`maxTurns`, `budgetTokens`, wall).

---

## 5. Rust (cellrt / tee) — three layers

### Layer 1 — Type system (compile time)

- Ownership: non-`Clone` `VirtualKey` / single-holder semantics
- `Send` / `Sync` for cross-task safety
- Exhaustive `enum` cell state machine
- Newtypes (`Percentage`, `CellId`, …) with validating constructors
- `Result` + `?` + `#[must_use]` on WORM writes

### Layer 2 — Runtime assertions

- `assert!` on production invariants; `debug_assert!` for expensive checks
- Checked arithmetic on budgets
- Explicit collection upper bounds on security-critical paths

### Layer 3 — Formal models (design time, before Rust)

Write small TLA+ (or Alloy) models for:

1. **Key uniqueness** — no two Running cells share an active virtual key
2. **WORM append-only** — written entries never mutate
3. **Cell liveness** — every Spawning cell eventually reaches Dead

TLC counterexamples beat production bug reports. The model is ground truth when implementation drifts.

Rough Effect≈60–70% of SPARK; safe Rust≈70–75% on memory/safety; **Layer 3 closes the product-critical remainder**.

---

## 6. Required vs optional — streams / Ouroboros

**Power of 10 implication:** subscription and evolutionary loops **must** carry explicit bounds.

| Surface                             | Bound fields                                | Rule                              |
| ----------------------------------- | ------------------------------------------- | --------------------------------- |
| `stream_subscribe` / cell consumers | `maxTurns`, `budgetTokens`, wall clock      | **Required** — no unbound default |
| Ouroboros `EvolutionaryLoop`        | `maxGenerations`, convergence / drift gates | Already capped; keep mandatory    |
| OpenBench / LAB                     | turns / tokens / wall                       | Already; keep                     |
| clawql-tee cell pool                | max resident cells, preallocated workers    | Prefer pool over unbounded spawn  |

---

## 7. WORM write failure policy

NASA “check all returns” applied:

| Outcome                      | Policy                                                                |
| ---------------------------- | --------------------------------------------------------------------- |
| LTX / bucket ack **success** | Continue                                                              |
| Ack **failure**              | **Halt cell** (or fail closed the request) — never continue unaudited |
| Ambiguous timeout            | Treat as failure until proven durable; prefer fail-closed             |

Propagating `?` without a **lifecycle decision** is incomplete. Cell supervisor owns the halt.

---

## 8. Defect → process (OpenBench / LAB)

| Event                  | Wrong response      | Shuttle-aligned response                              |
| ---------------------- | ------------------- | ----------------------------------------------------- |
| OpenBench 0 score      | Quietly retire cell | Ask what process allowed semantic FP / unbound search |
| LAB demotion           | Discard             | `FailedStrategy` + prompt extension + Wonder prior    |
| Panguard Gate 1/2 fail | Silent 403          | WORM escalation → `SecurityEvent`                     |

Same loop as [security↔ontology](../security/security-ontology-knowledge-loop.md) and [campaign memory](../benchmarks/harvey-lab-campaign-memory.md).

---

## 9. Phasing (opinionated)

| Priority | Work                                                                                            |
| -------- | ----------------------------------------------------------------------------------------------- |
| **P0**   | Document required caps on streams/Ouroboros APIs; WORM-fail → halt policy in tee/cellrt specs   |
| **P0**   | Effect Schema at remaining untrusted boundaries; STM/Ref for budget paths in inference/payments |
| **P1**   | TLA+ sketches for key uniqueness + WORM append-only + cell liveness (before heavy tee Rust)     |
| **P1**   | Rust newtypes + exhaustive cell FSM + `#[must_use]` WORM APIs in cellrt                         |
| **P2**   | Preallocated cell pools; Wasmtime memory ceilings after init                                    |
| **P2**   | Wire demotion / escalation into ontology FailedStrategy / SecurityEvent (companion specs)       |

---

## 10. Decision summary

| Topic                 | Decision                                                                              |
| --------------------- | ------------------------------------------------------------------------------------- |
| Correctness strategy  | Spec → types → runtime asserts → selective model check                                |
| Unbounded agent loops | **Forbidden** — caps required                                                         |
| Failed WORM write     | **Fail closed / halt cell**                                                           |
| Effect-TS role        | Primary DbC/DI/concurrency tool on TS; not a substitute for TLA+ on global invariants |
| Rust role             | Memory/ownership/FSM; plus asserts; plus TLA+ for three tee invariants                |
| SPARK/Ada             | Inspiration for contracts + info flow + Ravenscar — not “rewrite ClawQL in Ada”       |
| Process               | Spec-before-code; defects improve gates/ontology/security loop                        |

---

_Companion to clawql-tee / cellrt · Effect modularization · security↔ontology knowledge loop · LAB campaign memory · Constitutional Ouroboros_
