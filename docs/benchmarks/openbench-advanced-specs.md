# OpenBench advanced benchmark specifications (B-1 … B-6)

**Status:** Spec only (August 2026). Extends the OpenBench ledger from [#759](https://github.com/danielsmithdevelopment/ClawQL/pull/759) and the in-repo pack under [`openbench/`](../../openbench/).

**These are specifications, not results.** No run IDs exist yet. Update suite status when cells land. Every live cell must link a GitHub Actions run ID; use **n≥3** before statistical claim confidence.

Related: [`openbench.md`](openbench.md) · [`openbench/README.md`](../../openbench/README.md) · [`openbench-github-actions.md`](openbench-github-actions.md)

---

## Suite index

| Suite | Claim category                         | Priority | Status    |
| ----- | -------------------------------------- | -------- | --------- |
| B-1   | Fine-tuning flywheel delta             | Highest  | Spec only |
| B-2   | Multi-turn IDP pipeline                | Highest  | Spec only |
| B-3   | Long-horizon codegraph (SWE-bench style) | High   | Spec only — Phase 1 task packs landed |
| B-4   | Adversarial memory / conflict resolution | High   | Spec only — Phase 1 task packs landed |
| B-5   | NSV/SGDOP ensemble diversity           | High     | Spec only |
| B-6   | Domain-specific compliance QA (HLE analog) | Medium | Spec only |

---

## Methodology and shared constraints

All suites extend the OpenBench framework. Methodology matches proven claims: frugal model, hardened graders, real tool evidence, hard spend caps.

### Shared setup

| Field           | Value                                                                 |
| --------------- | --------------------------------------------------------------------- |
| Model baseline  | `openrouter/deepseek/deepseek-chat` (frugal tier), unless suite notes otherwise |
| Harness         | OpenCode wired to `clawql-inference` — same harness across on/off arms |
| Grader hardening | Both arms require real `tool:clawql_*` evidence. Off arm cannot score by generating plausible tool-call-shaped prose |
| Spend caps      | 50 turns / 180s / 8,000 tokens per Ouroboros run unless suite-specific |
| Scoring         | 1.0 = complete success; 0.0 = failure; partial where noted. **WIN** = on scores higher than off |
| Evidence        | Every cell links a GitHub Actions run ID |

### Why frugal model throughout

A claim that only holds on frontier models is a **model** capability claim, not a **product** claim. ClawQL tooling should close the gap between what a cheap model can do and what the task requires. B-1 and B-6 measure that gap explicitly; other suites use DeepSeek to show tool-driven behavioral change independent of model tier.

---

## B-1: Fine-tuning flywheel delta

Central flywheel claim: a fine-tuned small model on ClawQL tool-call traces outperforms the same base model on ClawQL tasks. Without this measurement, the flywheel is infrastructure with no payoff. **Run B-1 before interpreting B-2 / B-6 with a fine-tuned on-arm.**

### B-1.1 — Base vs fine-tuned on core ClawQL tasks

| Field            | Value |
| ---------------- | ----- |
| Product claim    | Fine-tuned Qwen3.6-27B produces more reliable ClawQL tool-call sequences than base Qwen3.6-27B on the same tasks |
| Arms             | `arm-base`: Qwen3.6-27B base (NVFP4, no adapter). `arm-ft`: Qwen3.6-27B + ClawQL-general LoRA |
| Task IDs         | `ft-search-first-discovery`, `ft-execute-verify-loop`, `ft-memory-roundtrip`, `ft-audit-checkpoints`, `ft-policy-deny-execute`, `ft-ouroboros-oscillation-escape` |
| Grader           | Identical to proven claims; record score, retry count, turns per arm |
| Spend cap        | 50 turns / 180s / 8,000 tokens |
| Expected         | `arm-ft` ≥ `arm-base` on all six; primary signal = lower retries/turns on search-first, execute-verify, Ouroboros |
| Status           | **Blocked** on Qwen3.6-27B ClawQL-general fine-tune v1 in `tier-map.json` |

### B-1.2 — Fine-tuned small model vs frontier without tools

| Field            | Value |
| ---------------- | ----- |
| Product claim    | Fine-tuned Qwen3.6-27B + ClawQL tools scores higher on ClawQL-specific classes than GPT-4o / Claude Sonnet **without** ClawQL tools |
| Arms             | `arm-ft-clawql` vs `arm-frontier-bare` |
| Task IDs         | Same six as B-1.1 + `ft-multi-provider-vault-scaffold` |
| Expected         | Memory-dependent tasks 1.0 vs 0.0 by construction; win or tie on stateless tasks |
| Status           | Blocked on fine-tune v1 and B-1.1 baseline |

### B-1.3 — Flywheel iteration delta

| Field            | Value |
| ---------------- | ----- |
| Product claim    | Each fine-tune cycle improves task performance over the previous cycle |
| Arms             | `arm-ft-v1`, `arm-ft-v2` |
| Metric           | Primary: retry reduction cycle-over-cycle; secondary: turns reduction |
| Status           | Long-horizon (requires ≥2 completed cycles + production traffic) |

---

## B-2: Multi-turn IDP pipeline

Current OpenBench tasks are mostly single-stage. Real IDP is a multi-stage chain. B-2 tests whether ClawQL orchestration completes pipelines that naive prompting cannot.

> Offline `dry_run` of `run_idp_pipeline` (NATS agent bridge) validates **wiring**, not a B-2 cell. Cells require stage artifacts: Merkle roots, VDR `deal_id`, WORM rows, Onyx hits.

### B-2.1 — Full seven-stage pipeline completion

| Field            | Value |
| ---------------- | ----- |
| Product claim    | ClawQL-orchestrated agents complete full IDP pipelines that fail mid-chain without ClawQL |
| Arms             | `arm-clawql` (tools + Ouroboros + Argo DAG simulation) vs `arm-bare` |
| Task IDs         | `idp-full-pipeline-invoice`, `idp-full-pipeline-contract`, `idp-full-pipeline-medical-form` |
| Stages           | (1) classify/pdf-inspector (2) LangExtract grounding (3) Stirling redact + Merkle (4) archive/Postgres (5) Onyx index (6) ConeShare VDR + `deal_id` (7) WORM audit verification |
| Score            | `stages_passed / 7` |
| Spend cap        | 100 turns / 360s / 16,000 tokens |
| Expected         | clawql ≈ 7/7; bare ≈ 3/7 (fails redact/archive/Onyx/VDR/audit) |
| Status           | Spec only — Phase 3 |

### B-2.2 — Pipeline resilience under stage failure

Inject Stirling timeout (stage 3) or Onyx failure (stage 5). `arm-ouroboros` (doom_loop=deny) should recover to 1.0; `arm-no-ouroboros` stalls at 0.0.

### B-2.3 — Provenance chain integrity

Every stage produces Merkle/WORM entries linked by `correlation_id` / `deal_id`. Bare arm fails by construction.

---

## B-3: Long-horizon codegraph (SWE-bench style)

Native TypeScript tree-sitter codegraph ([#793](https://github.com/danielsmithdevelopment/ClawQL/pull/793)) provides dependency navigation for cheap models on large graphs.

### B-3.1 — Cross-file feature implementation

| Field            | Value |
| ---------------- | ----- |
| Product claim    | Codegraph-guided edit lets frugal models implement multi-file features they miss without graph context |
| Arms             | `arm-codegraph` (DeepSeek + `codegraph_*` tools) vs `arm-bare` |
| Task IDs         | `codegraph-feature-api-surface` (**landed offline pack**), `codegraph-feature-20files`, `codegraph-bug-impact` |
| Grader criteria  | (1) compile/typecheck (2) existing tests pass (3) feature correct (4) no missed dependents vs impact set |
| Spend cap        | 100 turns / 360s / 16,000 tokens |
| Expected         | codegraph 1.0; bare fails criterion 4 (and often 2) |

**In-repo offline pack:** [`openbench/tasks/codegraph-feature-api-surface/`](../../openbench/tasks/codegraph-feature-api-surface/)

### B-3.2 — Language coverage (30+ languages)

Per-language impact accuracy for Python/Go/Rust baseline first. Status: Phase 6.

---

## B-4: Adversarial memory and conflict resolution

Recall alone is insufficient. B-4 tests **calibration**: conflicting or stale vault data should surface conflict, not confabulation.

### B-4.1 — Conflicting vault entries

| Field            | Value |
| ---------------- | ----- |
| Product claim    | Agents surface vault conflicts rather than synthesizing a false resolution |
| Task IDs         | `memory-conflict-pricing` (**landed**), `memory-conflict-contact`, `memory-conflict-policy` |
| Score 1.0        | Retrieves both entries, flags conflict, requests clarification or returns both with timestamps |
| Score 0.0        | Single non-ground-truth answer (hallucinated synthesis) |

**In-repo offline pack:** [`openbench/tasks/memory-conflict-pricing/`](../../openbench/tasks/memory-conflict-pricing/)

### B-4.2 — Stale cache invalidation

After a write, related reads must not return stale cached state.

**In-repo offline pack:** [`openbench/tasks/memory-stale-after-update/`](../../openbench/tasks/memory-stale-after-update/)

### B-4.3 — Vault memory under adversarial injection

Panguard ATR should block fabricated `memory_ingest` that contradicts vault policy/state; denial must be evidenced.

**In-repo offline pack:** [`openbench/tasks/memory-injection-attempt/`](../../openbench/tasks/memory-injection-attempt/)

---

## B-5: NSV/SGDOP ensemble diversity

When `combined_drift` > 0.3, Hermes MoA fan-out across model families should beat single-model routing on genuine multi-perspective tasks. Requires NSV/SGDOP metric export to graders. Phase 5.

### B-5.1 — Multi-perspective analysis tasks

Legal/financial/technical synthesis; compliance conflicting rules; investment memo. Human + automated graders; n≥5 before significance claims.

### B-5.2 — NSV threshold sensitivity

Above-threshold tasks benefit from fan-out; below-threshold tasks should not (token waste without quality gain).

---

## B-6: Domain-specific compliance QA (HLE analog)

Domain exams where fine-tune + retrieval beat frontier bare. Phase 4+ (blocked on fine-tune + vertical adapters + Onyx corpus).

### B-6.1 — Mortgage lending compliance exam

50 questions (RESPA, GSE overlays, QM/ATR, TRID, repurchase defense). `arm-ft-lending` vs `arm-frontier-bare`.

### B-6.2 — Retrieval-augmented compliance QA

Decompose fine-tune vs retrieval contribution (`arm-retrieval`, `arm-frontier-bare`, `arm-retrieval-frontier`).

### B-6.3 — Legal/M&A due diligence QA

Blocked on legal vertical adapter. After B-6.1.

---

## Recommended sequencing

| Phase | What runs | Dependency |
| ----- | --------- | ---------- |
| **1 (now)** | B-3.1, B-4.1, B-4.2, B-4.3 offline packs + live A/B when secrets present | Already on `main` infra |
| **2** | B-1.1, B-1.2 | Fine-tune v1 in `tier-map.json` |
| **3** | B-2.1–B-2.3 | Post B-1; vendor-live IDP + provenance graders |
| **4** | B-6.1 | Fine-tune + vertical adapter + Onyx corpus |
| **5** | B-5.1–B-5.2 | NSV/SGDOP instrumentation |
| **6** | B-1.3, B-3.2, B-6.3 | Long-horizon / second cycle |

### What a full B-1.2 win would mean

Fine-tuned ~27B + ClawQL tools beating frontier bare on ClawQL-specific classes makes the flywheel **measurable**: task-specific training + sovereign tooling, not raw scale — and the gap can widen each production training cycle.

---

## Maintenance

1. Keep this page as the **canonical advanced ledger**; suite rows update status when packs or live cells land.
2. Offline checkers must keep `python3 openbench/validate_tasks.py` green.
3. Live cells: prefer [`.github/workflows/openbench-ab.yml`](../../.github/workflows/openbench-ab.yml) with DeepSeek via OpenRouter; link run IDs in a future results table (do not invent IDs).
