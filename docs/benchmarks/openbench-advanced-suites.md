# OpenBench advanced suites — task breakdown & plans

**Status:** Spec / plan only (no live run IDs yet for B-*).  
**Companion:** [`openbench-stack-coverage.md`](./openbench-stack-coverage.md) · [`openbench-results-ledger.md`](./openbench-results-ledger.md) · PR [#759](https://github.com/danielsmithdevelopment/ClawQL/pull/759)

This document turns the six “impressive” suites (fine-tune flywheel → IDP pipeline → SWE-style codegraph → adversarial memory → NSV/SGDOP → domain HLE-analog) into **small, sequenced work items** with dependencies, acceptance criteria, and what is blocked.

---

## Framing (keep these separate)

| Track                     | Proves                                                                         | Audience                       | Model                                     |
| ------------------------- | ------------------------------------------------------------------------------ | ------------------------------ | ----------------------------------------- |
| **A — Frugal tool delta** | Cheap model + ClawQL ≫ same model without ClawQL                               | Devs / buyers evaluating tools | `openrouter/deepseek/deepseek-chat`       |
| **B — Moat / press**      | Fine-tuned small + ClawQL ≥ frontier bare on _ClawQL-shaped_ or _domain_ tasks | Investors / press              | Needs fine-tune + sometimes frontier BYOK |

Do **not** run raw closed-book HLE as the main track. Prefer retrieval-heavy / domain exams (suite B-6) after flywheel evidence (B-1).

**Shared OpenBench rules (all cells):** real `"tool":"clawql_*"` evidence · hard spend caps · prefer on=1.0/off=0.0 · retire from `pr_active` after clean WIN · aim n≥3 before statistical language.

---

## Recommended sequencing (phases)

```text
Phase 0  n≥3 Wilson on 3–5 headline cells          (dispatch; parallel anytime)
Phase 1  B-4.1 conflict + B-3.1 codegraph-lite     (now — no fine-tune)
Phase 1b B-4.2 cache (only if product claim real)  (spike first)
Phase 1c B-4.3 Panguard×ingest (product design?)   (spike first)
Phase 2  B-1.1 base vs FT on core OpenBench tasks  (blocked on fine-tune v1)
Phase 3  B-1.2 FT+ClawQL vs frontier bare          (after B-1.1)
Phase 4  B-2 stubbed IDP orchestration             (not live Stirling/Argo in PR)
Phase 5  B-6.1 mortgage compliance exam            (FT + corpus)
Phase 6  B-5 NSV/SGDOP                             (blocked on metric export)
Phase 7  B-1.3 cycle-over-cycle; B-3.2 langs; B-6.3 legal
```

---

## Phase 0 — Statistical credibility (small tasks)

| ID   | Task                                                                                                                                                        | Size | Done when                                                                                               |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ------------------------------------------------------------------------------------------------------- |
| P0-a | Pick 3–5 cells for n=3: `search-first-discovery`, `memory-roundtrip-ingest-recall`, `policy-deny-execute`, optionally `notify-mock-slack`, `onyx-mock-cite` | S    | List committed in ledger “replication queue”                                                            |
| P0-b | Add `OPENBENCH_TRIALS=3` via dispatch **or** `ci-matrix.json` → `pr_trials` (PR fallback when dispatch unavailable)                                         | S    | Docs in `openbench-github-actions.md`                                                                   |
| P0-c | Run first n=3 matrix (one task) via dispatch **or** `pr_trials` PR fallback                                                                                 | M    | ✅ [31011980064](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/31011980064) Wilson note |
| P0-d | Repeat for remaining queue; update “honest gaps”                                                                                                            | M    | Gaps say which cells have n≥3                                                                           |

**Do not** burn PR `pr_active` for pure replication — prefer `workflow_dispatch`.

---

## Phase 1 — Ship now (no fine-tune)

### B-4.1 — Conflicting vault entries (highest GTM payoff)

**Claim:** When vault notes conflict, clawql-on **surfaces both + flags conflict** instead of synthesizing a false single answer.

| ID     | Subtask                                                                                                                                        | Size | Notes                                    |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ---------------------------------------- |
| B4.1-a | Design fixture: two dated notes for same product price (current vs stale); decoy synthesis answer                                              | S    | Use `.openbench/memory-seed/` multi-file |
| B4.1-b | Write `instruction.md`: must `memory_recall`, report both values + conflict, write `conflict.json`                                             | S    | Ban single invented price                |
| B4.1-c | Checker: require real `clawql_memory_recall`; `conflict.json` has both prices + `conflict:true`; reject single stale or hallucinated mid value | M    | Anti-guess                               |
| B4.1-d | Caps/nudge/incomplete helpers in `run-ab-compare.py`                                                                                           | S    | Same patterns as wikilink                |
| B4.1-e | Wire `ci-matrix` `pr_active`, workflow option, harness if needed                                                                               | S    |                                          |
| B4.1-f | Live A/B → retire on WIN; explanations + ledger                                                                                                | M    |                                          |

**Task folder name (proposed):** `memory-conflict-pricing`

**Artifact sketch:**

```json
{
  "conflict": true,
  "values": [
    { "price": 42, "asOf": "2026-01-01" },
    { "price": 55, "asOf": "2026-06-01" }
  ],
  "chosen": null,
  "source": "memory_recall"
}
```

---

### B-3.1 — Long-horizon codegraph (SWE-bench _lite_, not full SWE-bench yet)

**Claim:** With `codegraph_index` + `query` / `neighbors` / `path` / `explain`, frugal model updates the **impact set**; without tools it misses dependents.

**Honest scope:** Start with a **bounded fixture repo** (~12–25 files), not a giant OSS tree. Grade impact coverage before chasing SWE-bench Verified submission.

| ID     | Subtask                                                                                                                                                              | Size | Notes                                                      |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ---------------------------------------------------------- |
| B3.1-a | Build fixture `repo/` with deliberate call graph: core util → 4–6 callers; decoy README with wrong file list                                                         | M    | Python or TS; match existing `codegraph-guided-edit` style |
| B3.1-b | Task: rename/fix a core function; must update all callers + a test                                                                                                   | M    | Instruction lists success criteria, not file list          |
| B3.1-c | Checker criteria: (1) real codegraph tool_use, (2) all required files touched, (3) optional `python -m compileall` / `tsc --noEmit`, (4) golden marker in dependents | L    | Partial credit later if needed                             |
| B3.1-d | Caps: 40–50 turns / 240–360s / 12k tokens; enable_codegraph                                                                                                          | S    |                                                            |
| B3.1-e | Live A/B → retire; doc “does not prove SWE-bench Verified”                                                                                                           | M    |                                                            |
| B3.1-f | _(Later)_ Expand fixture toward SWE-bench medium difficulty                                                                                                          | L    | Separate epic                                              |

**Task folder name (proposed):** `codegraph-impact-edit`

**Available tools today:** `codegraph_index`, `query`, `neighbors`, `path`, `explain`, `subgraph`, `import_graphify` — grade with these; do not require fictional `codegraph_impact` MCP name until it exists.

---

### B-4.2 — Stale cache after write (spike before shipping)

**Product check first:** MCP `cache` is ephemeral KV; inference has `invalidateByTags`. Confirm the _agent-visible_ claim (“second read after write is fresh”) matches real behavior.

| ID     | Subtask                                                                    | Size | Done when                           |
| ------ | -------------------------------------------------------------------------- | ---- | ----------------------------------- |
| B4.2-0 | Spike: document which cache (MCP vs inference semantic) the claim targets  | S    | ADR note in this file or design doc |
| B4.2-a | If MCP cache: task set→get→overwrite key→get; grader checks second get     | S    | Only if that’s the claim            |
| B4.2-b | If inference semantic cache: OpenBench may be wrong venue (inference-side) | —    | Park or move to inference benches   |

**Gate:** Do not put on `pr_active` until B4.2-0 says “ship.”

#### B4.2-0 spike decision (2026-08-05)

| Claim surface                         | Finding                                                                                                                              | Live OpenBench? |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | --------------- |
| MCP `cache` set→overwrite→get         | Overwrite is by-construction fresh (no separate invalidate API). Overlaps `cache-scratch-handoff` (already retired WIN).             | **No** — park   |
| Inference semantic `invalidateByTags` | Real product surface, but agent-visible OpenBench A/B is the wrong venue (gateway/inference benches).                                | **No** — park   |
| Offline `memory-stale-after-update`   | Local Python read-through cache bugfix (SWE-lite fixture). Valid offline pack; both arms have bash/edit so ClawQL A/B delta is weak. | Offline only    |

**Verdict:** keep offline pack; do **not** activate on `pr_active` as a ClawQL product claim.

---

### B-4.3 — Panguard blocks hostile `memory_ingest` (spike before shipping)

| ID     | Subtask                                                                                          | Size | Done when                  |
| ------ | ------------------------------------------------------------------------------------------------ | ---- | -------------------------- |
| B4.3-0 | Spike: can `CLAWQL_PANGUARD_BLOCK_TOOLS=memory_ingest` (or ATR rule) fail-closed like `execute`? | S    | Yes/no in notes            |
| B4.3-a | If yes: task prompts inject of contradictory record; grader requires deny evidence               | M    | Reuse policy-deny patterns |
| B4.3-b | If no: product issue first (“policy should cover ingest”), then bench                            | L    | Not OpenBench until fixed  |

#### B4.3-0 spike decision (2026-08-05)

**Yes.** In-process Panguard (`CLAWQL_PANGUARD_IN_PROCESS=1`) matches MCP tool names; `memory_ingest` is registered under that name (same path as `execute`). Unit coverage: `panguard-proxy-plugin.test.ts` blocks `memory_ingest` when listed. Live cell: `memory-injection-attempt` (hardened like `policy-deny-execute`).

---

## Phase 2–3 — Fine-tuning flywheel (B-1) — blocked

**Blocked on:** Qwen3.6-27B ClawQL-general LoRA v1 registered (e.g. `tier-map.json` / inference finetune path).

**Unblocked (collection):** GHA now writes `CLAWQL_INFERENCE_STORE=jsonl` under each OpenBench artifact and packages grader session labels — see [`openbench-trace-collection.md`](./openbench-trace-collection.md). Keep collecting while FT v1 lands.

| ID     | Subtask                                                                          | Size | Depends   |
| ------ | -------------------------------------------------------------------------------- | ---- | --------- |
| B1-0   | Confirm fine-tune artifact + how OpenBench selects `arm-base` vs `arm-ft` models | S    | FT v1     |
| B1.1-a | Runner support: two models, same tasks, same graders (reuse retired cells)       | M    | B1-0      |
| B1.1-b | Metrics sidecar: retries, turns, score per arm                                   | S    |           |
| B1.1-c | Run 6 core tasks × 2 arms; ledger “flywheel delta” table                         | L    |           |
| B1.2-a | Add frontier-bare arm (BYOK Claude/GPT, no ClawQL MCP)                           | M    | B1.1 pass |
| B1.2-b | Memory-dependent cell where bare loses by construction + 1–2 stateless cells     | M    |           |
| B1.3   | Cycle v2 vs v1 after production WORM traffic                                     | XL   | Months    |

**Success bar for investor story:** B-1.2 FT+ClawQL ≥ frontier bare on ClawQL-shaped tasks — only after B-1.1 shows FT ≥ base.

---

## Phase 4 — Multi-turn IDP (B-2) — stub first

**Do not** put live Stirling / Coneshare / Argo / live Onyx in PR OpenBench (ops confounds).

| ID     | Subtask                                                                                                                                              | Size | Notes                                                                                           |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ----------------------------------------------------------------------------------------------- |
| B2-0   | Define **stubbed** 5–7 stage chain using tools already graded: search/execute dry_run, audit Merkle-ish trail, memory_ingest, notify stub, onyx stub | M    | Map stages → existing MCP                                                                       |
| B2.1-a | Task `idp-safe-pipeline-lite`: agent must complete ordered stages; score stages_passed/N                                                             | L    | ✅ WIN [31039035892](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/31039035892) |
| B2.1-b | Artifacts: `pipeline.json` + trail with correlation_id                                                                                               | M    | ✅ `pipeline.json` graded                                                                       |
| B2.2   | Inject failure + Ouroboros recovery (optional cell)                                                                                                  | L    | After B2.1 WIN                                                                                  |
| B2.3   | Scheduled **integration** job with real services (not `pr_active`)                                                                                   | XL   | Secrets / cluster                                                                               |

**Live cell (B-2.0 / B2.1):** `idp-safe-pipeline-lite` **retired WIN** ([31039035892](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/31039035892) on 1.0 / off 0.0). Seven stubbed stages — discover → plan_extract → plan_redact → audit_trail → onyx_cite → notify_handoff → persist. Dual Slack/Onyx fetch stubs are URL-dispatched so both can coexist. **Does not** prove live Stirling/Argo/ConeShare (that is B2.3).

---

## Phase 5–6 — Domain HLE-analog (B-6) & NSV (B-5)

### B-6 (after B-1 + corpus)

| ID   | Subtask                                                        | Size |
| ---- | -------------------------------------------------------------- | ---- |
| B6-0 | SME-reviewed 50-question mortgage set + ground truth JSON      | XL   |
| B6-1 | Arms: FT+Onyx vs frontier bare; single-pass grading            | L    |
| B6-2 | Ablation: retrieval-only vs FT+retrieval vs frontier+retrieval | L    |
| B6-3 | Legal/M&A set after legal adapter exists                       | XL   |

### B-5 (blocked on instrumentation)

| ID   | Subtask                                                            | Size |
| ---- | ------------------------------------------------------------------ | ---- |
| B5-0 | Export `combined_drift` / NSV trigger into grader-readable sidecar | L    |
| B5-1 | Multi-perspective tasks + blind human rubric (n≥5)                 | XL   |
| B5-2 | Threshold sensitivity (above vs below 0.3)                         | L    |

Docs still mark DAOS NSV/SGDOP as **roadmap / not production-hardened** — keep B-5 out of PR OpenBench until B5-0 lands.

---

## Immediate execution checklist (next coding sessions)

Work **in this order** unless blocked:

1. **[P0-a]** Write replication queue into ledger (3 cells). ✅
2. **[B4.1-a→f]** Ship `memory-conflict-pricing` to `pr_active`, watch CI, retire. ✅ [30930194746](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30930194746)
3. **[Trace-0]** Persist OpenBench call-store JSONL from GHA. ✅  
   3b. **[Trace-1]** Publish-ready corpus: OpenBenchTrace v1, write-time scrub, WORM manifests, fail-loud R2. ✅  
   3c. **[Trace-2]** Productize as protocol + managed service docs + `packages/openbench-dataset` scaffold. ✅  
   3d. **[Trace-3]** Full collect/sync package path (S3/R2, arm correlation, GHA composite). ✅
4. **[B3.1-a→e]** Ship `codegraph-impact-edit` to `pr_active`, watch CI, retire. ✅ [30969554941](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30969554941)
5. **[B4.2-0]** Spike → **park live** (MCP overwrite trivial; inference semantic wrong venue; offline pack remains). ✅
6. **[B4.3-0]/a]** Spike yes + ship `memory-injection-attempt` live. ✅ [31022595633](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/31022595633)
7. **[P0-c]** First n=3 on `search-first-discovery`. ✅ [31011980064](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/31011980064)
8. **[P0-d]** Remaining queue complete: memory-roundtrip ✅ [31014040293](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/31014040293); policy-deny ✅ [31016004063](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/31016004063).
9. Park B-1/B-2-full/B-5/B-6 until their gates open; keep specs updated here. Collect traces on every live cell in the meantime.

Each shipped cell must also update: `ci-matrix.json`, task explanations, ledger, stack-coverage, and (for product claims) vision/GTM tables when headline-worthy.

---

## Mapping: suite → first OpenBench task IDs

| Suite | First concrete task ID                    | `pr_active` when?                                                                                       |
| ----- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| B-4.1 | `memory-conflict-pricing`                 | ✅ retired WIN                                                                                          |
| B-3.1 | `codegraph-impact-edit`                   | ✅ retired WIN                                                                                          |
| B-4.2 | `memory-stale-after-update`               | Parked (offline only)                                                                                   |
| B-4.3 | `memory-injection-attempt`                | ✅ retired WIN                                                                                          |
| B-2   | `idp-safe-pipeline-lite`                  | ✅ Retired WIN [31039035892](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/31039035892) |
| B-1   | reuse retired IDs under FT matrix         | After FT v1                                                                                             |
| B-6   | `compliance-mortgage-qa` (custom harness) | After B-1 + corpus                                                                                      |
| B-5   | `daos-multiperspective-*`                 | After metric export                                                                                     |

---

## What not to do yet

- Full Humanity’s Last Exam leaderboard chase.
- Live 7-stage IDP with real vendor SaaS on every PR.
- NSV ensemble claims without exported metrics + human rubric.
- Quoting Wilson / “beats GPT-5” before n≥3 and B-1.2 respectively.

---

## Links

- [Stack coverage / backlog](./openbench-stack-coverage.md)
- [Results ledger](./openbench-results-ledger.md)
- [Task explanations](./openbench-task-explanations.md)
- [GitHub Actions A/B](./openbench-github-actions.md)
- [Ouroboros value evidence](./ouroboros-value-evidence.md)
- Codegraph tools: [`packages/clawql-codegraph/README.md`](../../packages/clawql-codegraph/README.md)
