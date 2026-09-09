# Harvey LAB — Frozen Protocol (final)

**Status:** FROZEN as of 2026-09-03.  
**Do not deviate after the smoke gate passes.** Any post-gate change invalidates the run.

This document assembles the agreed standard from the operator, Cursor, and Grok review. Where earlier ClawQL docs disagree, **this file wins**.

---

## 1. Fixed facts (log before anything runs)

| Field | Value |
| ----- | ----- |
| Model ID | `NVIDIA-Nemotron-3.5-Lightning-30B-A3B` |
| Published baseline to beat | **0%** base / **8.3%** post-trained — Harvey's own held-out LAB, their harness, their judge |
| Local arm | Mac Mini, MLX, **quant PINNED and logged** before start |
| Hosted arm | OpenRouter **PAID** tier only — free tier is **disqualified** (200 req/day ⇒ multi-day ⇒ not contiguous) |

### Quant pin (must be determined before start)

Run does **not** start until the quant string is known and written into the run log.

**Pinned on this Mini (2026-09-03):**

- HF id: `mlx-community/NVIDIA-Nemotron-3.5-Lightning-30B-A3B-4bit`
- `config.json` → `"quantization": {"group_size": 64, "bits": 4, "mode": "affine"}`
- **Log string:** `4bit / affine / group_size=64` (bits=4 confirmed — not “probably 4-bit”)

---

## 2. Two matched arms (local-only arm is mandatory)

There is **no** valid claim from “Lightning+ClawQL vs Harvey’s published 8.3%” alone — that mixes hardware, quantization, and harness.

**Only valid comparison:**

| Arm | Machine | Quant | Stack |
| --- | ------- | ----- | ----- |
| **A** | same Mac Mini | same pinned quant | Lightning **alone** (no ClawQL) |
| **B** | same Mac Mini | same pinned quant | Lightning **+ ClawQL** |

Same tasks · same judge · same seeds · back to back · same day · same machine · nothing else changed.

If A and B are not run this way, **no** percentage from either arm is citable — not vs 8.3%, not vs each other, not vs a future run.

> **Naming note:** Older ClawQL docs used Arm A/B for Opus±ClawQL and “Arm C” for Nemotron. **Superseded.** ExtractBench “Arm A/B” is a different product. Do not conflate.

---

## 3. Task selection (fixed before either arm runs)

- Publish **actual task IDs** in advance by practice area, matching Harvey naming (e.g. `corporate-ma/review-data-room-red-flag-review`), not “tasks 1–25.”
- **No cherry-picking** a slice already expected to score well.
- **Mix:** retrieval/enumeration **and** draft/memo. If the published set is retrieval-heavy, the post must say **“retrieval-only subset”** — never imply full LAB.
- **N=25** has a wide CI (~24–65% for a ~44pp observation, per Grok). Prefer larger N within budget; otherwise **state the interval beside the number**.

Smoke (Step 1) uses **1–3** tasks only: one retrieval, one numeric-filter, one draft-style — IDs chosen and logged **before** either arm runs.

---

## 4. Ingest rule (disclose; do not leave ambiguous)

**Live extraction** from real Harvey LAB documents through the actual IDP path (Tika → LangExtract → DuckDB / current `ts-clawql-data-v2` stack), as a customer would run.

**NOT** a pre-loaded `ontology.db` with planted `CLAWQL_*` fields.

If that condition fails, the claim is **“structured query execution” only** — never “document intelligence,” never “agent competence,” no matter the score.

---

## 5. Scoring (Harvey rubric shape)

- Report **both** **all-pass** and **criteria-pass**, every time — never one alone.
- False-positive extra on a closed-set enumeration task **zeros that task’s all-pass** (same rule as Harvey / Grok citation). Do not soften.
- **Judge: Sonnet 4.6**, matching ClawQL benchmarks disclosed to date. If this differs from Harvey’s official judge, **state the divergence plainly** in the post.

Debug judges (`openai/gpt-5.4-mini`, local Ollama, etc.) may be used for engineering only — **not** for publishable / citable numbers under this protocol.

---

## 6. Execution order (hard gates)

### STEP 1 — Local smoke (1–3 tasks), today

One retrieval · one numeric-filter · one draft-style.

**PASS** = agent completes; real WORM / audit traces write; judge script returns a real rubric score; ClawQL **on and off** both execute cleanly; **nothing patches** Harvey’s harness file (`agent_loop.py` untouched).

**FAIL** = **stop**. Fix the stack. Do not scale. Do not run more tasks on a broken foundation.

Local Mini results from Step 1 are cited **only** as “pipeline is alive” — **never** as a performance number, **never** vs 8.3%, **never** as “local model beats datacenter model.”

### STEP 2 — Hosted paid-tier contiguous slice

Same published task IDs. Both arms A and B (§2). Same day / same session where possible. OpenRouter **paid** only.

**This** is the citable number — not Step 1.

### STEP 3 — Post only after Step 2 is clean

Fill every blank in §7 before publishing.

---

## 7. The one sentence the effort is building toward

> "On a pre-registered N-task LAB subset [task IDs attached], Nemotron 3.5 Lightning with ClawQL all-passed k/N (criteria-pass y%); the same model without ClawQL all-passed m/N (criteria-pass z%); official held-out Lightning is 0%/8.3%. Harness: [exact diff from Harvey's stock harness, ideally 'none']. Judge: Sonnet 4.6 [note if this differs from Harvey's own]."

Nothing publishes until every blank can be filled with something true.

---

## 8. Permanently unciteable (regardless of numbers)

| Artifact | Status |
| -------- | ------ |
| 5/5 synthetic mini-firm demo | Mechanism proof only |
| Quarantined 11/25 (old architecture) | Dead — stays dead |
| 25/25 SQL ground-truth check | Pipeline correctness only |
| Any local-only vs Harvey’s published number | **Invalid by construction** |
| Legacy `python-duckdb-v1` scorecards / composed 001–010 all-pass handoffs | Quarantined — not this stack |
| OpenRouter **free** tier multi-day “contiguous” slices | Disqualified |

---

## 9. Interruption / retry logging (non-negotiable)

Treat rate limits, timeouts, truncated outputs, and partial completions as a **distinct log category** (same spirit as `HOOK_SCOPE_VIOLATION_BLOCKED`): separately logged, never silently folded into a clean success record.

If Arm A or B is interrupted, retried, or partially completes, that fact is in the run log **and** disclosed in the eventual post.

---

## 10. Explicit supersessions (gaps that would otherwise cause claim failure)

| Prior source | Said | This protocol |
| ------------ | ---- | ------------- |
| `harvey-lab-action-plan.md` / README “Three arms” | A=Opus, B=Opus+ClawQL, C=Nemotron; OpenRouter-first | **Matched Lightning±ClawQL** on Mini (and paid hosted for cite); Opus arms deferred |
| GHA defaults / `harvey-lab-firm-knowledge.yml` | `nvidia/nemotron-3.5-lightning:free`, judge `gpt-5.4-mini` | Free **disqualified**; publishable judge **Sonnet 4.6** |
| `phase-a-single-task.sh` | Sonnet±ClawQL smoke | Wrong model family for this protocol’s Step 1 |
| ExtractBench Arm A/B | Qwen schema map vs Docling structural | **Unrelated** product — do not mix ledgers |
| Implied “local Mini F1 vs 8.3%” | Tempting narrative | **Forbidden** (§2, §6, §8) |
| Ingest | Older planted-ontology / perfect composed runs | Live IDP only (§4) or claim is demoted |

---

## Related

- Smoke gate (ts-v2 plumbing): [`harvey-lab-ts-v2-smoke-gate.md`](harvey-lab-ts-v2-smoke-gate.md)
- Stack lineage: [`harvey-lab-stack-lineage.md`](harvey-lab-stack-lineage.md)
- Rules compliance: [`harvey-lab-rules-compliance.md`](harvey-lab-rules-compliance.md)
- Results ledger (historical; filter through §8): [`harvey-lab-clawql-results.md`](harvey-lab-clawql-results.md)
- Overlay: [`../../integrations/harvey-labs/README.md`](../../integrations/harvey-labs/README.md)
