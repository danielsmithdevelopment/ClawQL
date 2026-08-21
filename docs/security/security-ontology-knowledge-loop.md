---
title: "Security ↔ Ontology knowledge loop — lessons from structured adversarial validation"
status: "Draft · August 2026"
packages: "clawql-security · panguard-mcp-bridge · clawql-ontology · clawql-tee / cellrt · clawql-ouroboros"
inspired_by: "https://blog.zsec.uk/bullyingllms/ (validation / grammar-adversarial / known-defence patterns — not operator bullying)"
companion: "docs/benchmarks/harvey-lab-campaign-memory.md (in-sweep campaign memory + Constitutional Ouroboros)"
---

# Security ↔ Ontology knowledge loop

**August 2026 · Draft**

**Related:** [MCP JWT ATR](./mcp-proxy-jwt-atr.md) · [Defense-in-depth](./clawql-comprehensive-defense-in-depth-mcp-k3s-may-2026.md) · [Enterprise Ontology](../architecture/enterprise-ontology.md) · [Legal domain](../specs/ontology/legal-domain-v0.1.md) · [clawql-tee](../streams/clawql-tee.md) · [cellrt](../streams/clawql-cellrt.md) · [Campaign memory / Constitutional Ouroboros](../benchmarks/harvey-lab-campaign-memory.md) · [Memory Finds. Ontology Decides.](https://pragmaticvectors.com/posts/memory-finds-ontology-decides/)

A vuln-research write-up ([zsec — “Bullying LLMs”](https://blog.zsec.uk/bullyingllms/)) is useful to ClawQL less for offensive tactics than for **architecture**: valid outer structure + adversarial inner content, guilty-until-proven promotion, known-dead-end memory, and a compounding knowledge loop. This note maps those patterns onto **clawql-security / Panguard**, **clawql-ontology**, and the **cell capability** story — then argues they should share one loop, not three siloed packages.

Tone: **standards and evidence**, not operator bullying. Same philosophy as Constitutional Ouroboros for LAB.

---

## 1. Meta-lesson (read this first)

**The knowledge base and the security system should be the same system.**

Today WORM audit, ontology, and Panguard are designed as adjacent concerns. The transferable architecture is tighter:

```
Panguard deny / escalation
        → WORM event (signal preserved)
        → ontology SecurityEvent / FailedStrategy record
        → Wonder queries priors before next plan
        → Reflect revises Seed / prompt extension
        → fewer future denials / FPs
```

Silent rejects throw away signal. Logged, typed outcomes become the known-defence / known-dead-end database. Promotion gates are simultaneously **quality** and **integrity**.

Package boundaries can remain (ship separately); **event contracts** must not.

---

## 2. clawql-security / Panguard

### 2.1 Grammar fuzzing → ATR enforcement

**Insight:** parsers die on _valid structure + adversarial fields_ (TIFF header + malicious IFD offset). The ClawQL analog is a **syntactically valid JWT** whose ATR claims were never issued for this cell — e.g. `tools: ["execute"]` on a token bound to a different instance.

**Gates (all required):**

| Gate  | Check                                                               |
| ----- | ------------------------------------------------------------------- |
| **0** | Signature / JWKS verification                                       |
| **1** | Scope binding — ATR claims match **this** cell / virtual key / tool |
| **2** | Budget / quota / rate still allows the call                         |

**Do not** treat Gate 0 success as trust. Treat every ATR claim as potentially adversarial until Gates 1–2 pass.

**Hallucination-bin equivalent:** a call that passes Gate 0 but fails Gate 1 or 2 is **not** a silent 403 with no residue. Emit a first-class WORM event, e.g. `PANGUARD_ESCALATION_ATTEMPT` (or `ATR_SCOPE_MISMATCH` / `ATR_BUDGET_EXCEEDED`), with enough structure to train later rules:

- `cellId`, `virtualKeyId`, `toolName`
- which gate failed
- claim fingerprint (not raw secrets)
- correlation id

Silent rejection discards the adversarial pattern database. Logging builds it.

**Pointers:** [mcp-proxy-jwt-atr.md](./mcp-proxy-jwt-atr.md) · defense-in-depth §3 / §5 · [#272](https://github.com/danielsmithdevelopment/ClawQL/issues/272).

### 2.2 Known-defence DB → typed `SecurityEvent` for rules engines

**Insight:** record which defences actually blocked attacks (and which “hits” were benign) so the next campaign does not re-burn the same wall.

**ClawQL form:** a durable, ontology-typed store (not only syslog), e.g. `clawql.SecurityEvent`:

| Field                    | Role                                              |
| ------------------------ | ------------------------------------------------- |
| `ruleId`                 | Falco / eBPF / Panguard rule id                   |
| `outcome`                | `confirmed` \| `false_positive` \| `inconclusive` |
| `syscall` / `toolName`   | What fired                                        |
| `cellId`, `virtualKeyId` | Tenant / cell binding                             |
| `confidenceDelta`        | How this outcome should reweight the rule         |

Rules engines **query** this schema (or a materialized view) to tune thresholds — fixed forever rules rot. Confirmed malicious ↑ weight; verified FP ↓ weight or carve-out.

This is the security twin of LAB **demotion → strategy note** ([campaign memory](../benchmarks/harvey-lab-campaign-memory.md)).

### 2.3 Privilege Gate 3 → cell capability audit (tee / cellrt)

**Insight:** “works as SYSTEM” is not the same as “works as the unprivileged principal you claim to protect.”

**ClawQL form:** clawql-tee / cellrt already constrain **WIT imports at instantiation**. Underspecified today: **runtime proof that a successful tool call only exercised declared capabilities**, not ambient host power.

For every successful tool call, WORM should record:

- which **capabilities / WIT imports** were exercised
- whether any were outside the cell’s granted world (Gate 3 failure — “worked for the wrong reason”)

Instantiation-time allowlists are necessary; **per-call capability accounting** is the Gate 3 twin. Spec gaps to close: [clawql-tee.md](../streams/clawql-tee.md), [clawql-cellrt.md](../streams/clawql-cellrt.md).

---

## 3. clawql-ontology

### 3.1 Negative path: `FailedStrategy` (missing half)

The ontology today encodes the **positive** path (schemas, valid fields, relationships). Institutional / security agents also need the **negative** path:

**Proposed entity:** `FailedStrategy`

| Field                  | Meaning                                |
| ---------------------- | -------------------------------------- |
| `corpus` / `domain`    | e.g. `firm-knowledge`, `panguard-prod` |
| `query`                | What was attempted                     |
| `filterApplied`        | Structured filters if any              |
| `falsePositivePattern` | Near-miss signature                    |
| `reason`               | Why demoted / denied                   |
| `sourceEventId`        | WORM / eval correlation                |

**Writers:** Reflect after demotion; Panguard escalation handlers; OpenBench/LAB graders.  
**Readers:** Wonder before planning (“similar strategies failed here”).

This is **richer than unpaired KTO labels** — it carries _reason_ — and feeds both retrieval quality and security tuning.

### 3.2 Append-only field history (not upsert-and-forget)

Legal / government workloads need **historical values as evidence**. Upsert that overwrites `escrowPct` when a contract amends destroys the audit story.

**Direction:** append-only field versions with timestamps (and optionally actor / ingestVersion), aligned with WORM for _structured state_, not only for events.

**Tension (already documented):** GDPR erasure vs immutability — prefer **cryptographic erasure** patterns from the security training series rather than silent overwrite. See compliance module on WORM vs Art. 17.

### 3.3 Corpus coverage is ontology knowledge

Coverage plateaus in fuzzing ≈ **sparse entity types** in the index. Lint should report per-type counts/gaps, e.g. “12 matters, 3 clients, 0 attorneys.”

Wonder should check **coverage before retrieval plans** that require missing relationship types — otherwise agents fail for data absence while believing the query is wrong.

Extend `clawql ontology lint` (and LAB campaign summaries) with **coverage statistics per entity type**.

---

## 4. One loop — proposed event contracts

Keep packages separate; standardize the bus:

| Producer                      | Event / record                                      | Consumer                            |
| ----------------------------- | --------------------------------------------------- | ----------------------------------- |
| Panguard / ATR proxy          | `PANGUARD_ESCALATION_ATTEMPT` (WORM)                | Ontology ingest → `SecurityEvent`   |
| LAB / OpenBench grader demote | demotion jsonl                                      | `FailedStrategy` + prompt extension |
| cellrt / tee                  | tool_call WORM + **capabilitiesExercised[]**        | Security lint / Gate 3 reports      |
| Wonder                        | query `FailedStrategy` + `SecurityEvent` + coverage | Reflect Seed patch                  |
| Reflect                       | Seed / `system-prompt.ext` update                   | Next execute generation             |

**Guardrails:**

- Do not write raw tokens / PII into ontology rows — hashes and classifications only where needed
- Rate-limit / aggregate noisy denies so the ontology is not a typed landfill
- Task vault isolation remains; campaign / security knowledge layers are intentional and scoped ([campaign memory](../benchmarks/harvey-lab-campaign-memory.md) §2)

---

## 5. What not to copy

- Operator bullying as the primary control loop — use **gates + principles + Wonder/Reflect**
- Flooding vendors / humans with unpromoted findings — same for security alerts: promote after confirmation gates
- Treating semantic RAG alone as the known-defence store — **type the outcomes** (`SecurityEvent`, `FailedStrategy`)
- Collapsing package boundaries into a monolith — share **contracts**, not a single deployable

---

## 6. Implementation phasing (opinionated)

| Phase  | Work                                                                                |
| ------ | ----------------------------------------------------------------------------------- |
| **P0** | Spec WORM shape for `PANGUARD_ESCALATION_ATTEMPT`; never silent-drop Gate 1/2 fails |
| **P0** | Draft `.cqe` for `SecurityEvent` + `FailedStrategy` in ontology packs               |
| **P1** | ATR proxy / bridge emits escalation events; optional ontology sync                  |
| **P1** | `ontology lint --coverage` per entity type                                          |
| **P2** | Append-only field history for legal pack (matter financial fields)                  |
| **P2** | cellrt/tee: `capabilitiesExercised` on tool_call WORM                               |
| **P3** | Wonder engines query FailedStrategy / SecurityEvent by default when flags on        |

---

## 7. Decision summary

| Topic                       | Decision                                               |
| --------------------------- | ------------------------------------------------------ |
| Valid JWT ⇒ trusted         | **No** — signature is Gate 0 only                      |
| Silent ATR deny             | **No** — WORM escalation event                         |
| Rules forever fixed         | **No** — typed outcomes reweight rules                 |
| Capability check            | Instantiation **and** per-call exercise audit          |
| Ontology positive-only      | **No** — add `FailedStrategy` (and security events)    |
| Field upsert overwrite      | Prefer **append-only history** for evidentiary domains |
| Lint                        | Include **corpus coverage** per entity type            |
| Security / ontology / agent | **One knowledge loop** via shared events               |

---

_Companion to Harvey LAB campaign memory · MCP JWT ATR · Enterprise Ontology · clawql-tee / cellrt capability sandbox_
