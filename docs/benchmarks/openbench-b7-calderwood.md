# B-7 — Institutional knowledge & amortized understanding (Calderwood & Harkness)

**Status:** Spec + Phase-1 offline pack (August 2026)  
**Suite id:** B-7  
**Canonical ledger rows:** [`openbench-advanced-specs.md`](./openbench-advanced-specs.md) · plan breakdown: [`openbench-advanced-suites.md`](./openbench-advanced-suites.md)  
**Upstream corpus:** Harvey + EngramLab **Calderwood & Harkness (C&H)** synthetic law firm (announced 2026-08-07)

---

## Why this suite exists

Harvey’s C&H environment is a persistent ~100M+ token firm corpus (46 fictional clients, 250+ matters, ~10k files) built to test whether agents can **search and reuse a firm’s past practice** the way a tenured associate would.

Their baseline finding matches ClawQL’s product claim:

> Agents find some relevant material and reason correctly about what they retrieve, but fail to search comprehensively — especially when many facts must be enumerated — and lack an intermediate model of the corpus.

B-7 turns that failure mode into OpenBench cells with hardened graders, frugal models, and RTP / OpenBenchTrace emission for the fine-tuning flywheel.

### Upstream pointers (track these — release is hours old)

| Resource               | URL                                                                  |
| ---------------------- | -------------------------------------------------------------------- |
| Harvey announcement    | https://x.com/harvey/status/2085778520220049891                      |
| Deep dive (X Article)  | https://x.com/i/article/2084850442614554624                          |
| EngramLab announcement | https://x.com/EngramLab/status/2085780822720909424                   |
| Parent LAB repo        | https://github.com/harveyai/harvey-labs                              |
| LAB blog               | https://www.harvey.ai/blog/introducing-harveys-legal-agent-benchmark |

**Mount note (2026-08-07):** C&H is described as open-sourced with LAB; the full 100M-token filesystem may still be landing as a release/tag or external mirror. Until the corpus path is stable, Phase-1 cells use an **in-repo mini-firm fixture** that preserves the same failure modes (distributed features, exhaustive enumeration, no keyword shortcuts).

---

## Product claim

ClawQL memory + search-first tools (+ optional Ouroboros) enable a frugal model to build and reuse an intermediate representation of a large firm corpus, producing **higher completeness** and **lower amortized latency/cost** than the same model searching from scratch on every task.

---

## Arms (full suite)

| Arm                    | Wiring                                                                                                     |
| ---------------------- | ---------------------------------------------------------------------------------------------------------- |
| `arm-clawql-memory`    | Full vault + `memory_recall` / ingest + search tools; vault **persists across related tasks in a session** |
| `arm-clawql-no-memory` | ClawQL tools present but vault wiped / memory disabled every task                                          |
| `arm-bare`             | Same model/harness; no ClawQL MCP (OpenBench `clawql-off`)                                                 |

**Phase-1 OpenBench A/B** uses the proven two-arm pattern `clawql-on` vs `clawql-off` (on ≈ memory arm). Three-arm amortized sessions are Phase-1b+.

---

## Task classes

1. **Exhaustive feature enumeration** — list every matter matching multi-field criteria (Harvey’s sharpest drop-off).
2. **Client preference reconstruction** — synthesize historical preferences across matters for one client.
3. **Cross-matter precedent synthesis** — short memo grounded in prior PE / software deals.
4. **Conflict / version awareness** — draft vs executed agreement; surface conflict + timestamps (overlaps B-4).
5. **Amortized cost sequence** — 5 related questions on one client; measure tokens + completeness with vs without persistent vault.

---

## Grader criteria

| #   | Criterion                                         | Notes                                                                       |
| --- | ------------------------------------------------- | --------------------------------------------------------------------------- |
| 1   | Completeness vs ground-truth feature / matter set | Prefer exact-set match; Harvey short-form matter specs when full C&H mounts |
| 2   | Search-sufficiency signal                         | Agent states why it stopped (optional rubric field in later cells)          |
| 3   | Amortized latency / tokens                        | Primary for sequence cells; secondary for single-shot                       |
| 4   | Provenance                                        | Which matter IDs / files informed the answer (RTP Delta + OpenBenchTrace)   |

Shared OpenBench rules still apply: real `tool:clawql_*` evidence · hard spend caps · link GHA run IDs · n≥3 before statistical language.

---

## Phase-1 (ship now)

| Cell  | Task id                             | Fixture                                              | Status                                 |
| ----- | ----------------------------------- | ---------------------------------------------------- | -------------------------------------- |
| B-7.1 | `institutional-knowledge-enumerate` | In-repo mini-firm vault seed (12 matters; 5 matches) | Offline pack landed                    |
| B-7.2 | `institutional-client-preference`   | Mini-firm client X preferences across 4 matters      | Spec only                              |
| B-7.3 | `institutional-amortized-session`   | Same vault; 5 related prompts; cost + completeness   | Spec only (needs session harness)      |
| B-7.4 | Full C&H mount                      | Mount open-sourced filesystem + Harvey task set      | Blocked on stable corpus download path |

Do **not** put B-7.1 on `pr_active` until a clean live WIN; prefer `workflow_dispatch`.

---

## Extensions into other suites

| Suite         | How C&H / B-7 feeds it                                                                        |
| ------------- | --------------------------------------------------------------------------------------------- |
| **B-1**       | Fine-tune on RTP traces from successful C&H / mini-firm runs; re-measure held-out enumeration |
| **B-4**       | Inject conflicting draft vs executed versions into the firm vault                             |
| **B-5**       | Multi-practice-area clause analysis spanning C&H cross-group matters                          |
| **B-2 / B-6** | Multi-stage retrieve → extract → memo → provenance; compliance overlays                       |

---

## Consent / traces

Every live cell should emit OpenBenchTrace outer envelope + RTP `turnSequence` when the collector is enabled. Consent token at job start remains required if traces leave the internal environment (see [`openbench-trace-collection.md`](./openbench-trace-collection.md)).
