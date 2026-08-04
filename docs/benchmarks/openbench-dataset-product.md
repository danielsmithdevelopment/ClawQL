# OpenBench dataset — protocol + ClawQL managed service

**Audience:** product, GTM, engineering  
**Status:** active build (ClawQL reference implementation first; OpenBench upstream next)  
**Related:** [trace collection](./openbench-trace-collection.md) · [upstream proposal](./openbench-dataset-upstream-proposal.md) · [advanced suites](./openbench-advanced-suites.md) · package [`packages/openbench-dataset`](../../packages/openbench-dataset/)

> This is a **protocol** (schema + toolchain). ClawQL is the first implementation and
> the first published dataset instance — not the owner of the format.

---

## Product picture

### Open-source protocol (ship / contribute now)

| Piece | Name | Role |
| ----- | ---- | ---- |
| Schema | **OpenBenchTrace** v1.0 | Stable, citable session/trial record |
| Package | **`openbench-dataset`** | Writer, backends, scrub, export CLI |
| CLI | `openbench-dataset export` (ClawQL today; `openbench export` upstream) | HF-ready JSONL + dataset card |
| Manifest | WORM batch manifest | Provenance: scrub policy, hashes, schema version |
| Distribution | GHA composite `openbench-dataset/collect` | Three-line drop-in for any CI |

Anyone running OpenBench-compatible agent benchmarks can emit interoperable training data. Other frameworks can implement the schema without ClawQL.

### Data policy (staged)

| When | What |
| ---- | ---- |
| Now | Protocol open; **raw** corpus private (R2 `raw/` + manifests) |
| After FT proves lift | Publish scrubbed, versioned HF snapshots (`exports/public/`) Apache-2.0 + datasheet |
| Ongoing | Network effect: other teams publish OpenBenchTrace datasets that can merge |

### Honest novelty

Not “first eval → fine-tune ever” (trajectory work exists: DeNovoSWE, ATLAS, TOUCAN, etc.).

**Claim:** first **standardized, citable, provenance-tracked, PII-safe (write-time) protocol** for turning MCP / agent benchmark runs into **publishable** fine-tuning datasets — with A/B graders as the labeler.

### ClawQL managed service (on clawql-inference)

You **run** the benchmarks. Customer gets outcomes, not a DIY pipeline.

| Tier | Deliverable | Typical buyer |
| ---- | ----------- | ------------- |
| **1 — Report** | Scored OpenBench A/B, run IDs, scope letter | “Where do we stand?” |
| **2 — Report + dataset** | + OpenBenchTrace exports, scrub manifests | Has own training infra |
| **3 — Full loop** | + fine-tune, register into **model escalation** (`tier-map.json`) | Wants the deployed model |

**Later (not day-one engagement):** **PorTAL** (Ramp portable LoRA) ports the task adapter to a new base without full retrain. That is post–first-FT economics, not collection.

**Gateway unlock:** teams already on clawql-inference already accumulate call-store traffic; the engagement formalizes graders → dataset → model. Non-gateway teams need retrofit or a fuller engagement.

### Terminology (ClawQL)

| Use | Do not use |
| --- | ---------- |
| **model escalation** | PAL (Ouroboros upstream term) |
| **agent coordination** | MoA / Mixture of Agents (Hermes term) |
| **PorTAL** | only for Ramp portable LoRA adapters |

### Virtuous loop

```text
OpenBench A/B (grader labels)
  → OpenBenchTrace + write-time scrub + WORM manifest
  → fine-tune
  → register → model escalation (tier-map.json)
  → production traffic → better traces → repeat
  → (later) PorTAL port to new bases
```

---

## Pricing sketch (internal — not public quote sheet)

| Tier | Shape | Notes |
| ---- | ----- | ----- |
| Report | Flat fee / engagement (~$2–5k) | Analysis deliverable; top of funnel |
| + Dataset | Report + per-trace after floor (~$0.02–0.05 after first 500) | Aligns with richer runs |
| Full loop | + FT fee (~$5–15k / engagement) | Compute is cheap; margin is curation + registration |

Hosted plan customers: natural upsell — gateway already running.

**Engagement risk:** you own the scores. Scope letter must pin task IDs, models, arms, grader criteria, spend caps, and OpenBench suite version. Template: [engagement-scope.md](./openbench-dataset-engagement-scope.md).

---

## Build sequence

1. ✅ ClawQL GHA: call store + OpenBenchTrace v1 build + fail-loud R2  
2. **Now:** `packages/openbench-dataset` scaffold + product/upstream docs  
3. Extract writer/export APIs from OpenBench scripts into the package  
4. Upstream proposal → OpenBench maintainers  
5. Accumulate corpus; FT v1; public HF snapshot  
6. GTM Benchmark Service section on inference playbook  

---

## Naming

| Layer | Name |
| ----- | ---- |
| Schema type | `OpenBenchTrace` |
| Package | `openbench-dataset` |
| HF org (preferred) | protocol-shaped (`openbench-traces/…`) not vendor-only |
| ClawQL reference set | e.g. `openbench-traces/clawql-v1` |
