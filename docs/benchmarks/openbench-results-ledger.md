### 2026-08-05 — `codegraph-feature-api-surface` WIN (RTP 1.1)

| Arm | Score             | Notes                                          |
| --- | ----------------- | ---------------------------------------------- |
| on  | **1.0** (6t, 53s) | Full widgets impact set + real codegraph tools |
| off | **0.0** (8t, 79s) | No codegraph tools under REQUIRE_CODEGRAPH     |

Run: [30981709304](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30981709304). Gate OK. **Durable R2:** 2 traces → `r2://clawql-openbench-traces/raw/2026/08/05/run-30981709304/codegraph-feature-api-surface/` (schema **1.1**, on-arm `suitable_for_training: true` + RTP). Prior partial [30980340926](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30980340926) (on 0.5). **Verdict:** retire from `pr_active`.

### 2026-08-05 — `codegraph-feature-api-surface` first live (RTP 1.1)

| Arm | Score              | Notes                                                                   |
| --- | ------------------ | ----------------------------------------------------------------------- |
| on  | **0.5** (4t, 151s) | handler+router ok; schema/openapi/tests incomplete; indexed `/` not `.` |
| off | **0.0** (3t, 51s)  | no codegraph tools (correct fail under REQUIRE_CODEGRAPH)               |

Run: [30980340926](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30980340926). **Durable R2:** 2× OpenBenchTrace **v1.1** packs synced (`rtp` present). Not a headline WIN — clear `pr_active`, merge RTP, harden nudge/instruction (root=`.`, finish full impact set) before re-activate.

# OpenBench results ledger

**Canonical log of live ClawQL OpenBench A/B cells.** Update this file after every
meaningful Actions run (pass, fail, flake, or infra timeout). Coverage / backlog
lives in [`openbench-stack-coverage.md`](./openbench-stack-coverage.md); this
document is the **scoreboard + run diary**.

| Field              | Value                                                                                                                                            |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| PR                 | [#759](https://github.com/danielsmithdevelopment/ClawQL/pull/759) (stacked on [#758](https://github.com/danielsmithdevelopment/ClawQL/pull/758)) |
| Branch             | `cursor/openbench-ouroboros-doom-loop-4ff0`                                                                                                      |
| Default model      | `openrouter/deepseek/deepseek-chat`                                                                                                              |
| Harness            | OpenCode → clawql-inference                                                                                                                      |
| How to grade a WIN | clawql-on (or ouroboros-on) mean score **>** off arm; prefer on=1.0 / off=0.0                                                                    |
| Last ledger update | 2026-08-04T16:40Z                                                                                                                                |
| CI matrix control  | [`openbench/ci-matrix.json`](../../openbench/ci-matrix.json) — only `pr_active` burns tokens on PR/push                                          |
| Task explanations  | [`openbench-task-explanations.md`](./openbench-task-explanations.md) — prove / why / how for every cell                                          |

---

## How to read this ledger

1. **Headline claims** — best verified WIN per task (cite the run).
2. **Run diary** — chronological Actions runs with per-task scores.
3. **Confounds & harness notes** — why a cell was invalid or needed a fix.
4. **Open gaps** — tasks not yet proven.

When you finish a new live matrix, **append a run diary section** (do not delete
history). Move the best WIN into the headline table if it improves the claim.

---

## Headline claims (best verified)

| Task                                               | Claim                                           | Best on                | Best off                | Run                                                                                                | Verdict                                                                                                               |
| -------------------------------------------------- | ----------------------------------------------- | ---------------------- | ----------------------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `ouroboros-oscillation-escape` (`doom_loop=allow`) | Ouroboros stops strategy thrash                 | **1.0** (5 turns, 78s) | **0.0** (4 turns, 167s) | [30863572642](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30863572642)           | **WIN**                                                                                                               |
| `ouroboros-oscillation-escape` (`doom_loop=deny`)  | Still wins with production doom_loop on         | **1.0** (5 turns, 73s) | **0.0** (2 turns, 171s) | [30866904277](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30866904277) deny cell | **WIN**                                                                                                               |
| `memory-dependent-continuation`                    | Vault recall after seed removal                 | **1.0**                | **0.333**               | [30872913516](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30872913516)           | **WIN**                                                                                                               |
| `token-budget-constrained`                         | Nested recipe under token pressure              | **1.0**                | **0.0**                 | [30872437811](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30872437811)           | **WIN**                                                                                                               |
| `multi-provider-api-workflow`                      | Vault → Worker/wrangler scaffold                | **1.0** (3 turns, 33s) | **0.75**                | [30881158522](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30881158522)           | **WIN** (margin; also early [30868287877](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30868287877)) |
| `memory-roundtrip-ingest-recall`                   | Empty vault ingest→recall                       | **1.0**                | **0.0**                 | [30872913516](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30872913516)           | **WIN**                                                                                                               |
| `search-first-discovery`                           | Must call `clawql_search`                       | **1.0**                | **0.0**                 | [30872913516](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30872913516)           | **WIN** (after anti-guess)                                                                                            |
| `execute-verify-loop`                              | search + ≥2 dry_run execute                     | **1.0**                | **0.0**                 | [30872913516](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30872913516)           | **WIN**                                                                                                               |
| `audit-checkpoints`                                | audit append×3 + list → trail                   | **1.0** (2 turns, 29s) | **0.0**                 | [30881158522](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30881158522)           | **WIN** (replicated after idle flake)                                                                                 |
| `policy-deny-execute`                              | Panguard blocks execute                         | **1.0**                | **0.0**                 | [30872913516](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30872913516)           | **WIN**                                                                                                               |
| `cache-scratch-handoff`                            | clawql_cache set/get handoff                    | **1.0** (4 turns, 33s) | **0.0**                 | [30881158522](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30881158522)           | **WIN**                                                                                                               |
| `pageindex-section-qa`                             | PageIndex build+synthesize buried code          | **1.0** (4 turns, 38s) | **0.0**                 | [30881158522](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30881158522)           | **WIN**                                                                                                               |
| `codegraph-guided-edit`                            | Structural index locates SECRET_MARKER          | **1.0** (3 turns, 53s) | **0.0**                 | [30885341377](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30885341377)           | **WIN**                                                                                                               |
| `schedule-synthetic-dry-run`                       | schedule create + dry_run trigger               | **1.0** (3 turns, 32s) | **0.0**                 | [30885341377](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30885341377)           | **WIN**                                                                                                               |
| `external-ingest-continue`                         | ingest_external_knowledge → memory_recall       | **1.0** (5 turns, 37s) | **0.0**                 | [30887394038](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30887394038)           | **WIN**                                                                                                               |
| `hybrid-recall-source-pin`                         | PageIndex retrieves buried handbook code        | **1.0** (5 turns, 52s) | **0.0**                 | [30888793063](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30888793063)           | **WIN**                                                                                                               |
| `notify-mock-slack`                                | Stubbed Slack notify milestone                  | **1.0** (2 turns, 21s) | **0.0**                 | [30891002305](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30891002305)           | **WIN**                                                                                                               |
| `sandbox-trusted-compute`                          | Docker sandbox_exec trusted token               | **1.0** (3 turns, 30s) | **0.0**                 | [30891002305](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30891002305)           | **WIN**                                                                                                               |
| `composed-safe-rollout`                            | search→dry_run×2→audit→ingest                   | **1.0** (5 turns, 79s) | **0.0**                 | [30891002305](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30891002305)           | **WIN**                                                                                                               |
| `onyx-mock-cite`                                   | Stubbed Onyx knowledge cite                     | **1.0** (3 turns, 17s) | **0.0**                 | [30893132189](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30893132189)           | **WIN**                                                                                                               |
| `memory-wikilink-hop`                              | Recall follows [[wikilink]] hop                 | **1.0** (3 turns, 56s) | **0.0**                 | [30893132189](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30893132189)           | **WIN**                                                                                                               |
| `memory-conflict-pricing`                          | Surface conflicting vault prices (no synthesis) | **1.0** (3 turns, 29s) | **0.0**                 | [30930194746](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30930194746)           | **WIN**                                                                                                               |

Replicated Ouroboros WINs also on [30872913519](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30872913519) (allow + deny both on 1.0 / off 0.0).

---

## Run diary

## Run diary

### 2026-08-04 — [30888793063](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30888793063) (hybrid catalog-scale handbook)

| Arm        | Score   | Turns | Wall (s) | Notes                                                          |
| ---------- | ------- | ----- | -------- | -------------------------------------------------------------- |
| clawql-on  | **1.0** | 5     | 51.7     | read → build_tree (with fern-42 markdown) → synthesize → write |
| clawql-off | **0.0** | 2     | 7.2      | Correct fail (no real pageindex tools)                         |

**Verdict:** **WIN** — retire hybrid from `pr_active`.

### 2026-08-04 — [30888249849](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30888249849) (hybrid empty-md harden)

| Arm        | Score | Turns | Wall (s) | Notes                                                                                     |
| ---------- | ----- | ----- | -------- | ----------------------------------------------------------------------------------------- |
| clawql-on  | 0.0   | 1     | 154      | Read handbook then nudge timed out (90s) trying to re-emit ~14KB markdown into build_tree |
| clawql-off | 0.0   | 2     | 9.8      | Correct fail                                                                              |

**Verdict:** shrink handbook to catalog-like size (same pattern as pageindex-section-qa WIN). Keep `pr_active`.

### 2026-08-04 — [30887394038](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30887394038) (anti-guess + external-ingest)

| Task                     | on                | off               | Verdict                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------ | ----------------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| hybrid-recall-source-pin | 0.0 (3t, 86s)     | 0.0 (2t, 6s)      | **TIE fail** — off correctly fails (anti-guess works). on called pageindex but `build_tree` with `markdown:""`, synthesize empty, wrote `{"CLAWQL_HYBRID_CODE":"fern-42"}` (wrong shape / not via PageIndex content). Harden: require non-empty handbook markdown in build **or** fern-42 in synthesize output; accept `code`/`CLAWQL_HYBRID_CODE` keys; clearer nudge. |
| external-ingest-continue | **1.0** (5t, 37s) | **0.0** (3t, 11s) | **WIN** — retire after this run.                                                                                                                                                                                                                                                                                                                                        |

### 2026-08-04 — [30886497135](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30886497135) (hybrid harden attempt)

| Arm        | Score | Turns | Wall (s) | Notes                                                                                                                                                      |
| ---------- | ----- | ----- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| clawql-on  | 1.0   | 3     | 78.0     | After nudge: real build_tree + synthesize; wrote fern-42                                                                                                   |
| clawql-off | 1.0   | 4     | 20.7     | **False pass** — read handbook + write; attempted unavailable pageindex tools recorded as `"tool":"invalid"` with name in `input.tool`; naive grep matched |

**Verdict:** **TIE (invalid)** — not a headline WIN. Fix: `require-real-clawql-tools.py` + lengthen handbook; keep hybrid `pr_active`. Also ship `external-ingest-continue` as next P1.

### 2026-08-04 — [30863572642](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30863572642) (ouroboros, allow)

| Arm           | Score | Turns | Wall (s) |
| ------------- | ----- | ----- | -------- |
| ouroboros-on  | 1.0   | 5     | 78.1     |
| ouroboros-off | 0.0   | 4     | 167.5    |

Notes: First clean thrash WIN with memory disabled, hard caps ≤50 turns / 180s / 8000 tokens, on-only seed appendix.

### 2026-08-04 — [30866904277](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30866904277) (ouroboros allow + deny)

**allow**

| Arm           | Score | Turns | Wall (s) |
| ------------- | ----- | ----- | -------- |
| ouroboros-on  | 1.0   | 5     | 55.0     |
| ouroboros-off | 0.0   | 11    | 181.4    |

**deny**

| Arm           | Score | Turns | Wall (s) |
| ------------- | ----- | ----- | -------- |
| ouroboros-on  | 1.0   | 5     | 72.8     |
| ouroboros-off | 0.0   | 2     | 171.4    |

Notes: Additive production-guard cell — Ouroboros still wins when OpenCode `doom_loop=deny`.

### 2026-08-04 — [30868287877](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30868287877) (clawql on/off, pre-anti-guess)

Model: `openrouter/deepseek/deepseek-chat` · SHA `01240fec…`

| Task                           | on  | off     | Notes                             |
| ------------------------------ | --- | ------- | --------------------------------- |
| memory-dependent-continuation  | 1.0 | 0.333   | WIN                               |
| token-budget-constrained       | 1.0 | 0.0     | WIN                               |
| multi-provider-api-workflow    | 1.0 | 0.75    | WIN                               |
| memory-roundtrip-ingest-recall | 1.0 | 0.0     | WIN                               |
| search-first-discovery         | 1.0 | **1.0** | **TIE** — off guessed operationId |
| execute-verify-loop            | 1.0 | **1.0** | **TIE** — off invented trail.json |

Follow-up: require `"tool":"clawql_*"` evidence on **both** arms.

### 2026-08-04 — [30871190463](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30871190463) (anti-guess + new tasks)

| Task                           | on      | off     | Notes                                              |
| ------------------------------ | ------- | ------- | -------------------------------------------------- |
| memory-dependent-continuation  | 1.0     | 0.333   | WIN                                                |
| token-budget-constrained       | 1.0     | 0.0     | WIN                                                |
| multi-provider-api-workflow    | 1.0     | 1.0     | TIE (off scaffolded)                               |
| memory-roundtrip-ingest-recall | 1.0     | 0.0     | WIN                                                |
| search-first-discovery         | **1.0** | **0.0** | **WIN** (anti-guess worked)                        |
| execute-verify-loop            | 0.0     | 0.0     | on omitted dry_run in execute args                 |
| audit-checkpoints              | 0.0     | 0.0     | on used audit×4, no write                          |
| cache-scratch-handoff          | 0.0     | 0.0     | called bare `cache` → invalid                      |
| policy-deny-execute            | 0.0     | 0.0     | execute blocked; reason collapsed to generic error |

Follow-ups: Panguard `isError` text; dry_run/write nudges; `clawql_cache` naming.

### 2026-08-04 — [30871786843](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30871786843)

| Task                           | on      | off     | Notes                                       |
| ------------------------------ | ------- | ------- | ------------------------------------------- |
| memory-dependent-continuation  | 1.0     | 0.333   | WIN                                         |
| token-budget-constrained       | 1.0     | 0.0     | WIN                                         |
| memory-roundtrip-ingest-recall | 1.0     | 0.0     | WIN                                         |
| search-first-discovery         | 1.0     | 0.0     | WIN                                         |
| policy-deny-execute            | **1.0** | **0.0** | **WIN** (Panguard surface fix)              |
| execute-verify-loop            | 0.0     | 0.0     | on stopped after search only                |
| audit-checkpoints              | 0.0     | 0.0     | wrote `/tmp/opencode/trail.json` (absolute) |
| cache-scratch-handoff          | 0.0     | 0.0     | invalid `cache` + source source=file        |
| multi-provider-api-workflow    | 0.0     | 1.0     | on fail / off pass (noise)                  |

### 2026-08-04 — [30872437811](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30872437811)

| Task                           | on      | off     | Notes                                                                      |
| ------------------------------ | ------- | ------- | -------------------------------------------------------------------------- |
| memory-dependent-continuation  | 1.0     | 0.333   | WIN                                                                        |
| token-budget-constrained       | 1.0     | 0.0     | WIN                                                                        |
| memory-roundtrip-ingest-recall | 1.0     | 0.0     | WIN                                                                        |
| search-first-discovery         | 1.0     | 0.0     | WIN                                                                        |
| policy-deny-execute            | 1.0     | 0.0     | WIN                                                                        |
| audit-checkpoints              | **1.0** | **0.0** | **WIN** (relative-path nudge)                                              |
| execute-verify-loop            | 0.0     | 0.0     | on completed tools+trail; checker falsely failed search (log dump replace) |
| cache-scratch-handoff          | 0.0     | 0.0     | idle OpenCode session                                                      |
| multi-provider-api-workflow    | 0.75    | 0.75    | TIE                                                                        |

Follow-up: never replace combined agent logs with longer harness dump; grep log files on disk.

### 2026-08-04 — [30872913516](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30872913516) + ouroboros [30872913519](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30872913519)

| Task                           | on      | off     | Notes                                               |
| ------------------------------ | ------- | ------- | --------------------------------------------------- |
| memory-dependent-continuation  | 1.0     | 0.333   | WIN                                                 |
| memory-roundtrip-ingest-recall | 1.0     | 0.0     | WIN                                                 |
| search-first-discovery         | 1.0     | 0.0     | WIN                                                 |
| execute-verify-loop            | **1.0** | **0.0** | **WIN** (log-merge fix)                             |
| policy-deny-execute            | 1.0     | 0.0     | WIN                                                 |
| token-budget-constrained       | 1.0     | **1.0** | TIE this cell (off hit timeout wall with score 1.0) |
| audit-checkpoints              | 0.0     | 0.0     | idle (no tools) — flake vs prior WIN                |
| cache-scratch-handoff          | 0.0     | 0.0     | clawql_cache **set×2** observed; no get/write       |
| multi-provider-api-workflow    | 0.0     | 0.0     | both fail                                           |

Ouroboros [30872913519](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30872913519): allow on 1.0 / off 0.0; deny on 1.0 / off 0.0 (replication).

### 2026-08-04 — [30873723884](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30873723884) + [30874355356](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30874355356) + [30876062118](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30876062118) + [30877405306](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30877405306)

**Infra timeout noise (repeated).** OpenCode hung with `timeout after 180s/240s/300s`, **no tool_use**, turns=null across the matrix (workflow still marked success). Same pattern on ouroboros [30874355348](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30874355348) / [30877405323](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30877405323). [30877405306](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30877405306) was a docs-only PR push that still burned a full 10-task matrix.

**Do not treat as claim regression.** Likely OpenRouter stampede / inference stall under high parallel fan-out. Mitigations landed: **retire proven tasks** from `pr_active`, `max-parallel: 2`, drop docs path filters, ouroboros dispatch-only.

### CI retire policy (token spend)

When a task is thoroughly verified (headline WIN, ideally replicated):

1. Move it from `pr_active` → `retired` in [`openbench/ci-matrix.json`](../../openbench/ci-matrix.json).
2. PR/push stops running it; `workflow_dispatch` can still pick the task or `all-including-retired`.
3. Ouroboros is retired from PR auto-runs (`openbench-ouroboros-ab.yml` is **workflow_dispatch only**).

**Still active (keep testing):** `cache-scratch-handoff`, `pageindex-section-qa`, `audit-checkpoints`, `multi-provider-api-workflow`.

### 2026-08-04 — [30878740458](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30878740458) (lean `pr_active` only)

Matrix correctly reduced to 4 tasks; ouroboros workflow did **not** fire. All four cells still infra-hung (on/off timeout, turns=null, no tool_use). Inference log showed startup only.

Follow-ups: serialize `max-parallel: 1`, pin `opencode-ai@1.18.11`, `--print-logs`, skip remaining arms after first infra hang, tighten headless permissions (`question=deny`, `external_directory=allow`).

### 2026-08-04 — [30880006784](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30880006784) — **root cause: OpenRouter 402**

`--print-logs` showed the hang is **not** mystery infra: OpenRouter returned
`HTTP 402` — _“This request requires more credits, or fewer max_tokens. You
requested up to 16384 tokens, but can only afford 755.”_ OpenCode retries the
stream error until our wall timeout (classic #8203-style hang).

**Actions taken:**

- Pause PR live A/B: `openbench/ci-matrix.json` → `live_enabled: false`
- Cap OpenCode model `limit.output` default to 2048
- Abort remaining arms/trials on credit exhaustion
- Keep `pr_active` list ready; flip `live_enabled: true` after topping up `OPENROUTER_API_KEY` (or switch to BYOK)

### 2026-08-04 — [30885341377](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30885341377) (P1/P2 next wave)

| Task                       | on                | off     | Notes                                                                                                                                                                                                                           |
| -------------------------- | ----------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| codegraph-guided-edit      | **1.0** (3t, 53s) | **0.0** | **WIN** — index + query + write; tools clawql_codegraph_*                                                                                                                                                                       |
| schedule-synthetic-dry-run | **1.0** (3t, 32s) | **0.0** | **WIN** — clawql_schedule×2 + write                                                                                                                                                                                             |
| hybrid-recall-source-pin   | 0.0 (4t, 36s)     | 0.0     | **TIE fail** — on called pageindex tools but wrote literal placeholder `<value after CLAWQL_HYBRID_CODE=>` (did not read handbook.md; tree likely built from instruction text). Hardened instruction + nudge; keep `pr_active`. |

Retired codegraph + schedule after WIN. Hybrid remains active.

### 2026-08-04 — [30881158522](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30881158522) (post-credit resume, lean matrix)

All four then-`pr_active` cells **WIN** on frugal DeepSeek; no 402; real tool_use:

| Task                        | on                | off      | on tools (abbrev)                             | Verdict               |
| --------------------------- | ----------------- | -------- | --------------------------------------------- | --------------------- |
| cache-scratch-handoff       | **1.0** (4t, 33s) | **0.0**  | read×2, clawql_cache×4, write                 | **WIN**               |
| pageindex-section-qa        | **1.0** (4t, 38s) | **0.0**  | read, pageindex_build_tree, synthesize, write | **WIN**               |
| audit-checkpoints           | **1.0** (2t, 29s) | **0.0**  | clawql_audit×4, write                         | **WIN** (replication) |
| multi-provider-api-workflow | **1.0** (3t, 33s) | **0.75** | memory_recall, write×3                        | **WIN** (margin)      |

Those four were retired after this run; later wave added hybrid/codegraph/schedule.

---

## Confounds & harness notes (cumulative)

| Issue                                 | Symptom                                                             | Fix                                                                      |
| ------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Instruction-text “tool evidence”      | grep matched `clawql_search` inside the prompt dump                 | Require `"tool":"clawql_search"` tool_use JSON only                      |
| OpenCode MCP names                    | Model called `cache` → `invalid` tool                               | Instructions/nudges use `clawql_cache`                                   |
| Absolute write paths                  | audit wrote `/trail.json` or `/tmp/opencode/…`                      | Nudge exact relative `trail.json`                                        |
| Panguard reason lost                  | OpenCode showed “An error has occurred”                             | `mcp-tool-wrap` returns `isError` + reason text                          |
| dry_run omitted                       | execute called live GitHub; trail lied `dryRunOnly:true`            | Require `"dry_run":true` in tool input + nudge                           |
| Harness dump replace                  | Longer nudge dump dropped earlier `clawql_search`                   | Merge dump into combined; never replace                                  |
| Vault one-shot (early)                | Both ouroboros arms scored 1.0                                      | Disable memory for thrash study                                          |
| Infra hang                            | Whole matrix timeout, no tools                                      | Re-run; annotate as noise in this ledger                                 |
| OpenRouter 402 credits                | OpenCode `stream error` + hang until wall                           | Top up key; cap `limit.output`; `live_enabled=false` until funded        |
| Hybrid placeholder write              | answer.json copied instruction template                             | Require read handbook.md; ban angle-bracket placeholders                 |
| Invalid-tool pageindex false positive | off scored 1.0 without ClawQL (30886497135)                         | Parse real `part.tool` ≠ `invalid` via require-real-clawql-tools.py      |
| Empty pageindex markdown              | on build_tree with `markdown:""` then guessed fern-42 (30887394038) | Require handbook markdown in build input or fern-42 in synthesize output |
| Oversized handbook re-emit            | on nudge timed out emitting ~14KB markdown (30888249849)            | Shrink handbook to catalog-like size (~pageindex-section-qa)             |

---

## Open gaps (not yet headline WIN)

1. **n≥3 (ideally ≥5)** trials per cell for Wilson intervals (most headline cells still n=1–2) — Phase 0 in [`openbench-advanced-suites.md`](./openbench-advanced-suites.md).
2. **Phase 1 advanced:** `memory-conflict-pricing` (B-4.1) + `codegraph-impact-edit` (B-3.1) **retired WIN**; next B-4.2/B-4.3 spikes or P0 n≥3.
3. **Trace collection:** GHA call-store JSONL now persists — [`openbench-trace-collection.md`](./openbench-trace-collection.md).
4. Optional later: agentic external benches / domain HLE-analog (B-6) after fine-tune — not closed-book HLE.
5. Blocked: B-1 flywheel (needs FT v1), B-5 NSV (needs metric export), full live IDP pipeline (ops).

### 2026-08-05 — next cell: `codegraph-feature-api-surface`

Activate B-3 API-surface impact set for live A/B under OpenBenchTrace **v1.1 / RTP**.
Goal: grow OBT+RTP corpus with real `codegraph_*` tool traces after `codegraph-impact-edit` retire.

### 2026-08-05 — [30977578882](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30977578882) (B-3.1 + durable R2 corpus — WIN)

| Task                  | on                | off               | Verdict                                                                               |
| --------------------- | ----------------- | ----------------- | ------------------------------------------------------------------------------------- |
| codegraph-impact-edit | **1.0** (5t, 82s) | **0.0** (2t, 47s) | **WIN** — rename + impact; **call_store=17**; R2 sync to `clawql-openbench-traces` OK |

**Notes:** After `CLOUDFLARE_ACCOUNT_ID` was added: bucket auto-created; `Synced 2 traces → r2://clawql-openbench-traces/raw/2026/08/05/run-30977578882/codegraph-impact-edit/`. Earlier WIN [30969554941](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30969554941) lacked R2. **Verdict:** retire from `pr_active` (empty pending next cell).

### 2026-08-05 — [30969554941](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30969554941) (B-3.1 codegraph impact rename — WIN, pre-R2)

| Task                  | on                 | off               | Verdict                                                                                   |
| --------------------- | ------------------ | ----------------- | ----------------------------------------------------------------------------------------- |
| codegraph-impact-edit | **1.0** (4t, 109s) | **0.0** (3t, 50s) | **WIN** — 7-file rename + impact.json via codegraph; off lacked tools / bad impact schema |

**Notes:** Job failed durable R2 (`CLOUDFLARE_ACCOUNT_ID` missing at the time). Superseded for corpus evidence by [30977578882](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30977578882).

### 2026-08-04 — [30930194746](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30930194746) (B-4.1 conflict memory — WIN)

| Task                    | on                | off               | Verdict                                                 |
| ----------------------- | ----------------- | ----------------- | ------------------------------------------------------- |
| memory-conflict-pricing | **1.0** (3t, 29s) | **0.0** (2t, 13s) | **WIN** — both prices + conflict:true via memory_recall |

**Verdict:** retire from `pr_active` (empty pending B-3.1).

### 2026-08-04 — Phase 1 B-4.1 shipped (awaiting CI)

`pr_active` = `memory-conflict-pricing`. Multi-file vault seed with Acme Widget Pro prices 42 (2026-01-15) vs 55 (2026-06-01). Graders require both prices + `conflict:true` + real `memory_recall` (reject single-price or synthesized 48).

### Replication queue (Phase 0)

| Task                             | Target n | Status            |
| -------------------------------- | -------- | ----------------- |
| `search-first-discovery`         | 3        | queued (dispatch) |
| `memory-roundtrip-ingest-recall` | 3        | queued            |
| `policy-deny-execute`            | 3        | queued            |

### 2026-08-04 — [30893132189](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30893132189) (P2.5 — both WIN)

| Task                | on                | off               | Verdict                                                      |
| ------------------- | ----------------- | ----------------- | ------------------------------------------------------------ |
| onyx-mock-cite      | **1.0** (3t, 17s) | **0.0** (2t, 13s) | **WIN** — clawql_knowledge_search_onyx + citations quartz-21 |
| memory-wikilink-hop | **1.0** (3t, 56s) | **0.0** (1t, 11s) | **WIN** — clawql_memory_recall hop → opal-33                 |

**Verdict:** retire both from `pr_active` (empty again).

### 2026-08-04 — P2.5 wave shipped (awaiting CI)

`pr_active` set to `onyx-mock-cite`, `memory-wikilink-hop`. Product docs (platform / GTM / token-efficiency) updated with P2 WINs. Multi-file vault seed via `.openbench/memory-seed/`. Harness forwards Onyx stub env into MCP child.

### 2026-08-04 — [30891002305](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30891002305) (P2 wave — all WIN)

| Task                    | on                | off               | Verdict                                              |
| ----------------------- | ----------------- | ----------------- | ---------------------------------------------------- |
| notify-mock-slack       | **1.0** (2t, 21s) | **0.0** (2t, 14s) | **WIN** — clawql_notify + notify.json; stub Slack    |
| sandbox-trusted-compute | **1.0** (3t, 30s) | **0.0** (3t, 18s) | **WIN** — clawql_sandbox_exec docker → sand-77       |
| composed-safe-rollout   | **1.0** (5t, 79s) | **0.0** (2t, 26s) | **WIN** — search + dry_run×2 + audit + memory_ingest |

**Verdict:** retire all three from `pr_active` (empty again). First offline gate failed on missing `marker` in `solution/notify.json` ([30890720126](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30890720126)); fixed before this run.

### 2026-08-04 — P2 wave shipped (awaiting CI)

`pr_active` set to `notify-mock-slack`, `sandbox-trusted-compute`, `composed-safe-rollout`. Wiring: Slack fetch stub + minimal OpenAPI fixture; Docker sandbox with `python:3.12-alpine` pre-pull; composed sequence graders + nudges. Harness forwards NOTIFY/SANDBOX/SPEC_PATH into MCP child.

---

## Product-doc claim upgrades (2026-08-04)

Stakeholder framing: these headline WINs upgrade **architectural** statements to **empirically verified** claims (run IDs, frugal DeepSeek, anti-guess graders). Wired into:

| Doc                                                                                          | What changed                                                                                                            |
| -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| [`docs/vision/clawql-idp-platform.md`](../vision/clawql-idp-platform.md)                     | **Empirically verified platform claims** table includes P2 notify/sandbox/composed                                      |
| [`docs/vision/clawql-idp-gtm.md`](../vision/clawql-idp-gtm.md)                               | Differentiator #7 + gateway objection handlers (memory / search-first / Panguard / Ouroboros / notify+sandbox+composed) |
| [`docs/architecture/clawql-token-efficiency.md`](../architecture/clawql-token-efficiency.md) | **Live behavioral evidence** for Layer 1 search-first + Layer 6 vault-under-pressure + composed rollout                 |
| [`docs/benchmarks/openbench-task-explanations.md`](./openbench-task-explanations.md)         | Thorough prove / why / how for every verified cell                                                                      |

---

## Maintenance checklist (every live matrix)

- [ ] Download Actions artifacts (`gh run download <id>`).
- [ ] Append a **Run diary** subsection with the table of on/off scores, turns, wall.
- [ ] Update **Headline claims** if a new best WIN lands.
- [ ] Note confounds / infra (timeouts, ties, flakes) explicitly.
- [ ] If a task is thoroughly verified: move it `pr_active` → `retired` in [`ci-matrix.json`](../../openbench/ci-matrix.json).
- [ ] Point [`openbench-stack-coverage.md`](./openbench-stack-coverage.md) “Live OpenBench today” at this ledger for detail.
- [ ] Optional: `memory_ingest` a short pointer to the new run id under vault title `OpenBench ClawQL stack coverage`.
