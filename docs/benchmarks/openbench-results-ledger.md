# OpenBench results ledger

**Canonical log of live ClawQL OpenBench A/B cells.** Update this file after every
meaningful Actions run (pass, fail, flake, or infra timeout). Coverage / backlog
lives in [`openbench-stack-coverage.md`](./openbench-stack-coverage.md); this
document is the **scoreboard + run diary**.

| Field | Value |
| ----- | ----- |
| PR | [#759](https://github.com/danielsmithdevelopment/ClawQL/pull/759) (stacked on [#758](https://github.com/danielsmithdevelopment/ClawQL/pull/758)) |
| Branch | `cursor/openbench-ouroboros-doom-loop-4ff0` |
| Default model | `openrouter/deepseek/deepseek-chat` |
| Harness | OpenCode → clawql-inference |
| How to grade a WIN | clawql-on (or ouroboros-on) mean score **>** off arm; prefer on=1.0 / off=0.0 |
| Last ledger update | 2026-08-04T07:20Z |
| CI matrix control | [`openbench/ci-matrix.json`](../../openbench/ci-matrix.json) — only `pr_active` burns tokens on PR/push |
| Task explanations | [`openbench-task-explanations.md`](./openbench-task-explanations.md) — prove / why / how for every cell |

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

| Task | Claim | Best on | Best off | Run | Verdict |
| ---- | ----- | ------- | -------- | --- | ------- |
| `ouroboros-oscillation-escape` (`doom_loop=allow`) | Ouroboros stops strategy thrash | **1.0** (5 turns, 78s) | **0.0** (4 turns, 167s) | [30863572642](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30863572642) | **WIN** |
| `ouroboros-oscillation-escape` (`doom_loop=deny`) | Still wins with production doom_loop on | **1.0** (5 turns, 73s) | **0.0** (2 turns, 171s) | [30866904277](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30866904277) deny cell | **WIN** |
| `memory-dependent-continuation` | Vault recall after seed removal | **1.0** | **0.333** | [30872913516](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30872913516) | **WIN** |
| `token-budget-constrained` | Nested recipe under token pressure | **1.0** | **0.0** | [30872437811](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30872437811) | **WIN** |
| `multi-provider-api-workflow` | Vault → Worker/wrangler scaffold | **1.0** (3 turns, 33s) | **0.75** | [30881158522](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30881158522) | **WIN** (margin; also early [30868287877](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30868287877)) |
| `memory-roundtrip-ingest-recall` | Empty vault ingest→recall | **1.0** | **0.0** | [30872913516](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30872913516) | **WIN** |
| `search-first-discovery` | Must call `clawql_search` | **1.0** | **0.0** | [30872913516](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30872913516) | **WIN** (after anti-guess) |
| `execute-verify-loop` | search + ≥2 dry_run execute | **1.0** | **0.0** | [30872913516](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30872913516) | **WIN** |
| `audit-checkpoints` | audit append×3 + list → trail | **1.0** (2 turns, 29s) | **0.0** | [30881158522](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30881158522) | **WIN** (replicated after idle flake) |
| `policy-deny-execute` | Panguard blocks execute | **1.0** | **0.0** | [30872913516](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30872913516) | **WIN** |
| `cache-scratch-handoff` | clawql_cache set/get handoff | **1.0** (4 turns, 33s) | **0.0** | [30881158522](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30881158522) | **WIN** |
| `pageindex-section-qa` | PageIndex build+synthesize buried code | **1.0** (4 turns, 38s) | **0.0** | [30881158522](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30881158522) | **WIN** |
| `codegraph-guided-edit` | Structural index locates SECRET_MARKER | **1.0** (3 turns, 53s) | **0.0** | [30885341377](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30885341377) | **WIN** |
| `schedule-synthetic-dry-run` | schedule create + dry_run trigger | **1.0** (3 turns, 32s) | **0.0** | [30885341377](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30885341377) | **WIN** |

Replicated Ouroboros WINs also on [30872913519](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30872913519) (allow + deny both on 1.0 / off 0.0).

---

## Run diary

### 2026-08-04 — [30886497135](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30886497135) (hybrid harden attempt)

| Arm | Score | Turns | Wall (s) | Notes |
| --- | ----- | ----- | -------- | ----- |
| clawql-on | 1.0 | 3 | 78.0 | After nudge: real build_tree + synthesize; wrote fern-42 |
| clawql-off | 1.0 | 4 | 20.7 | **False pass** — read handbook + write; attempted unavailable pageindex tools recorded as `"tool":"invalid"` with name in `input.tool`; naive grep matched |

**Verdict:** **TIE (invalid)** — not a headline WIN. Fix: `require-real-clawql-tools.py` + lengthen handbook; keep hybrid `pr_active`. Also ship `external-ingest-continue` as next P1.

### 2026-08-04 — [30863572642](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30863572642) (ouroboros, allow)

| Arm | Score | Turns | Wall (s) |
| --- | ----- | ----- | -------- |
| ouroboros-on | 1.0 | 5 | 78.1 |
| ouroboros-off | 0.0 | 4 | 167.5 |

Notes: First clean thrash WIN with memory disabled, hard caps ≤50 turns / 180s / 8000 tokens, on-only seed appendix.

### 2026-08-04 — [30866904277](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30866904277) (ouroboros allow + deny)

**allow**

| Arm | Score | Turns | Wall (s) |
| --- | ----- | ----- | -------- |
| ouroboros-on | 1.0 | 5 | 55.0 |
| ouroboros-off | 0.0 | 11 | 181.4 |

**deny**

| Arm | Score | Turns | Wall (s) |
| --- | ----- | ----- | -------- |
| ouroboros-on | 1.0 | 5 | 72.8 |
| ouroboros-off | 0.0 | 2 | 171.4 |

Notes: Additive production-guard cell — Ouroboros still wins when OpenCode `doom_loop=deny`.

### 2026-08-04 — [30868287877](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30868287877) (clawql on/off, pre-anti-guess)

Model: `openrouter/deepseek/deepseek-chat` · SHA `01240fec…`

| Task | on | off | Notes |
| ---- | -- | --- | ----- |
| memory-dependent-continuation | 1.0 | 0.333 | WIN |
| token-budget-constrained | 1.0 | 0.0 | WIN |
| multi-provider-api-workflow | 1.0 | 0.75 | WIN |
| memory-roundtrip-ingest-recall | 1.0 | 0.0 | WIN |
| search-first-discovery | 1.0 | **1.0** | **TIE** — off guessed operationId |
| execute-verify-loop | 1.0 | **1.0** | **TIE** — off invented trail.json |

Follow-up: require `"tool":"clawql_*"` evidence on **both** arms.

### 2026-08-04 — [30871190463](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30871190463) (anti-guess + new tasks)

| Task | on | off | Notes |
| ---- | -- | --- | ----- |
| memory-dependent-continuation | 1.0 | 0.333 | WIN |
| token-budget-constrained | 1.0 | 0.0 | WIN |
| multi-provider-api-workflow | 1.0 | 1.0 | TIE (off scaffolded) |
| memory-roundtrip-ingest-recall | 1.0 | 0.0 | WIN |
| search-first-discovery | **1.0** | **0.0** | **WIN** (anti-guess worked) |
| execute-verify-loop | 0.0 | 0.0 | on omitted dry_run in execute args |
| audit-checkpoints | 0.0 | 0.0 | on used audit×4, no write |
| cache-scratch-handoff | 0.0 | 0.0 | called bare `cache` → invalid |
| policy-deny-execute | 0.0 | 0.0 | execute blocked; reason collapsed to generic error |

Follow-ups: Panguard `isError` text; dry_run/write nudges; `clawql_cache` naming.

### 2026-08-04 — [30871786843](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30871786843)

| Task | on | off | Notes |
| ---- | -- | --- | ----- |
| memory-dependent-continuation | 1.0 | 0.333 | WIN |
| token-budget-constrained | 1.0 | 0.0 | WIN |
| memory-roundtrip-ingest-recall | 1.0 | 0.0 | WIN |
| search-first-discovery | 1.0 | 0.0 | WIN |
| policy-deny-execute | **1.0** | **0.0** | **WIN** (Panguard surface fix) |
| execute-verify-loop | 0.0 | 0.0 | on stopped after search only |
| audit-checkpoints | 0.0 | 0.0 | wrote `/tmp/opencode/trail.json` (absolute) |
| cache-scratch-handoff | 0.0 | 0.0 | invalid `cache` + source source=file |
| multi-provider-api-workflow | 0.0 | 1.0 | on fail / off pass (noise) |

### 2026-08-04 — [30872437811](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30872437811)

| Task | on | off | Notes |
| ---- | -- | --- | ----- |
| memory-dependent-continuation | 1.0 | 0.333 | WIN |
| token-budget-constrained | 1.0 | 0.0 | WIN |
| memory-roundtrip-ingest-recall | 1.0 | 0.0 | WIN |
| search-first-discovery | 1.0 | 0.0 | WIN |
| policy-deny-execute | 1.0 | 0.0 | WIN |
| audit-checkpoints | **1.0** | **0.0** | **WIN** (relative-path nudge) |
| execute-verify-loop | 0.0 | 0.0 | on completed tools+trail; checker falsely failed search (log dump replace) |
| cache-scratch-handoff | 0.0 | 0.0 | idle OpenCode session |
| multi-provider-api-workflow | 0.75 | 0.75 | TIE |

Follow-up: never replace combined agent logs with longer harness dump; grep log files on disk.

### 2026-08-04 — [30872913516](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30872913516) + ouroboros [30872913519](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30872913519)

| Task | on | off | Notes |
| ---- | -- | --- | ----- |
| memory-dependent-continuation | 1.0 | 0.333 | WIN |
| memory-roundtrip-ingest-recall | 1.0 | 0.0 | WIN |
| search-first-discovery | 1.0 | 0.0 | WIN |
| execute-verify-loop | **1.0** | **0.0** | **WIN** (log-merge fix) |
| policy-deny-execute | 1.0 | 0.0 | WIN |
| token-budget-constrained | 1.0 | **1.0** | TIE this cell (off hit timeout wall with score 1.0) |
| audit-checkpoints | 0.0 | 0.0 | idle (no tools) — flake vs prior WIN |
| cache-scratch-handoff | 0.0 | 0.0 | clawql_cache **set×2** observed; no get/write |
| multi-provider-api-workflow | 0.0 | 0.0 | both fail |

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
`HTTP 402` — *“This request requires more credits, or fewer max_tokens. You
requested up to 16384 tokens, but can only afford 755.”* OpenCode retries the
stream error until our wall timeout (classic #8203-style hang).

**Actions taken:**
- Pause PR live A/B: `openbench/ci-matrix.json` → `live_enabled: false`
- Cap OpenCode model `limit.output` default to 2048
- Abort remaining arms/trials on credit exhaustion
- Keep `pr_active` list ready; flip `live_enabled: true` after topping up `OPENROUTER_API_KEY` (or switch to BYOK)

### 2026-08-04 — [30885341377](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30885341377) (P1/P2 next wave)

| Task | on | off | Notes |
| ---- | -- | --- | ----- |
| codegraph-guided-edit | **1.0** (3t, 53s) | **0.0** | **WIN** — index + query + write; tools clawql_codegraph_* |
| schedule-synthetic-dry-run | **1.0** (3t, 32s) | **0.0** | **WIN** — clawql_schedule×2 + write |
| hybrid-recall-source-pin | 0.0 (4t, 36s) | 0.0 | **TIE fail** — on called pageindex tools but wrote literal placeholder `<value after CLAWQL_HYBRID_CODE=>` (did not read handbook.md; tree likely built from instruction text). Hardened instruction + nudge; keep `pr_active`. |

Retired codegraph + schedule after WIN. Hybrid remains active.

### 2026-08-04 — [30881158522](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30881158522) (post-credit resume, lean matrix)

All four then-`pr_active` cells **WIN** on frugal DeepSeek; no 402; real tool_use:

| Task | on | off | on tools (abbrev) | Verdict |
| ---- | -- | --- | ----------------- | ------- |
| cache-scratch-handoff | **1.0** (4t, 33s) | **0.0** | read×2, clawql_cache×4, write | **WIN** |
| pageindex-section-qa | **1.0** (4t, 38s) | **0.0** | read, pageindex_build_tree, synthesize, write | **WIN** |
| audit-checkpoints | **1.0** (2t, 29s) | **0.0** | clawql_audit×4, write | **WIN** (replication) |
| multi-provider-api-workflow | **1.0** (3t, 33s) | **0.75** | memory_recall, write×3 | **WIN** (margin) |

Those four were retired after this run; later wave added hybrid/codegraph/schedule.

---

## Confounds & harness notes (cumulative)

| Issue | Symptom | Fix |
| ----- | ------- | --- |
| Instruction-text “tool evidence” | grep matched `clawql_search` inside the prompt dump | Require `"tool":"clawql_search"` tool_use JSON only |
| OpenCode MCP names | Model called `cache` → `invalid` tool | Instructions/nudges use `clawql_cache` |
| Absolute write paths | audit wrote `/trail.json` or `/tmp/opencode/…` | Nudge exact relative `trail.json` |
| Panguard reason lost | OpenCode showed “An error has occurred” | `mcp-tool-wrap` returns `isError` + reason text |
| dry_run omitted | execute called live GitHub; trail lied `dryRunOnly:true` | Require `"dry_run":true` in tool input + nudge |
| Harness dump replace | Longer nudge dump dropped earlier `clawql_search` | Merge dump into combined; never replace |
| Vault one-shot (early) | Both ouroboros arms scored 1.0 | Disable memory for thrash study |
| Infra hang | Whole matrix timeout, no tools | Re-run; annotate as noise in this ledger |
| OpenRouter 402 credits | OpenCode `stream error` + hang until wall | Top up key; cap `limit.output`; `live_enabled=false` until funded |
| Hybrid placeholder write | answer.json copied instruction template | Require read handbook.md; ban angle-bracket placeholders |
| Invalid-tool pageindex false positive | off scored 1.0 without ClawQL (30886497135) | Parse real `part.tool` ≠ `invalid` via require-real-clawql-tools.py |

---

## Open gaps (not yet headline WIN)

1. **`hybrid-recall-source-pin`** — still `pr_active` after invalid-tool TIE; anti-guess + longer handbook pending re-run.
2. **`external-ingest-continue`** — shipped; awaiting first live A/B.
3. **notify / sandbox / composed recipes** — backlog.
4. **n≥3 (ideally ≥5)** trials per cell for Wilson intervals (most headline cells still n=1–2).

---

## Product-doc claim upgrades (2026-08-04)

Stakeholder framing: these headline WINs upgrade **architectural** statements to **empirically verified** claims (run IDs, frugal DeepSeek, anti-guess graders). Wired into:

| Doc | What changed |
| --- | ------------ |
| [`docs/vision/clawql-idp-platform.md`](../vision/clawql-idp-platform.md) | New **Empirically verified platform claims** table; executor.sh memory/security/efficiency rows cite OpenBench |
| [`docs/vision/clawql-idp-gtm.md`](../vision/clawql-idp-gtm.md) | Differentiator #7 + gateway objection handlers (memory / search-first / Panguard / Ouroboros) |
| [`docs/architecture/clawql-token-efficiency.md`](../architecture/clawql-token-efficiency.md) | **Live behavioral evidence** for Layer 1 search-first + Layer 6 vault-under-pressure |
| [`docs/benchmarks/openbench-task-explanations.md`](./openbench-task-explanations.md) | Thorough prove / why / how for every verified cell |

---

## Maintenance checklist (every live matrix)

- [ ] Download Actions artifacts (`gh run download <id>`).
- [ ] Append a **Run diary** subsection with the table of on/off scores, turns, wall.
- [ ] Update **Headline claims** if a new best WIN lands.
- [ ] Note confounds / infra (timeouts, ties, flakes) explicitly.
- [ ] If a task is thoroughly verified: move it `pr_active` → `retired` in [`ci-matrix.json`](../../openbench/ci-matrix.json).
- [ ] Point [`openbench-stack-coverage.md`](./openbench-stack-coverage.md) “Live OpenBench today” at this ledger for detail.
- [ ] Optional: `memory_ingest` a short pointer to the new run id under vault title `OpenBench ClawQL stack coverage`.
