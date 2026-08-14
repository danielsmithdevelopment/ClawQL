# Deep thinking — worked examples

## Example A: Inference “stopped listening” mid-holdout6e

### CoT — Restart inference for holdout6e run-scoped store

#### 1. Goal
Keep `:8091` clawql-inference up for a ~70min holdout6e eval with run id `holdout6e`.

#### 2. World state (observed, not hoped)
- Long-lived inference already ran ~28h in Cursor background terminal `543202`.
- MCP `:8080` and Docling `:5001` up; Ollama has `qwen3.6:35b-eb`.
- Want run-scoped call-store under `runs/holdout6e/`.
- Prior holdout6d mean F1 ~46.8%; Niobrara structural seed fix ready.

#### 3. Evidence so far
- Background terminal start pattern already proven durable this session.
- No crash reports / OOM for inference historically.
- Start script `exec`s node — killing the shell kills the server.

#### 4. Assumptions
| # | Assumption | If false | Falsify |
|---|------------|----------|---------|
| A1 | `nohup … &` in a short agent shell survives after the tool call ends | Gateway dies mid-eval; Connection error | Start, end shell, curl healthz 30s later |
| A2 | Exit 143 means we (or harness) sent SIGTERM, not an app crash | Would see stack / DiagnosticReport | Check exit code + logs |
| A3 | Changing run id requires restarting the process | Might only need env on next request | Read store code |

#### 5. Hypotheses
- H1: App crash / OOM under load
- H2: Intentional kill during “restart for run id”
- H3: Agent shell teardown SIGTERM’s process group of `nohup` child

#### 6. Options
| Option | Durability | Blast radius | Time | Notes |
|--------|------------|--------------|------|-------|
| O1 Kill + `nohup` in same short shell as smoke | Low | Loses listener | 10s | Shortcut |
| O2 Kill + new `block_until_ms:0` background terminal | High | Brief downtime | 30s | Known-good |
| O3 Leave old process; only set RUN_ID on client | Highest | None | 0 | If A3 false |

#### 7. Decision (what we wrongly did)
Pick: **O1** — “faster to smoke + launch together.”
Rejected: O2 because it felt slower.
Risk accepted: untested A1.
**Correct decision would have been O2** (or O3 if A3 falsified).

#### 8. First verification
After parent shell ends: `curl :8091/healthz` still ok; `lsof -iTCP:8091` shows same pid.

#### 9. Stop conditions
If healthz fails before doc 1 of eval → do not declare model failure; restore O2.

### After-action
- Expected: full ~70min run, 6 scores.
- Observed: ~2min “complete”; 4/6 `Connection error` / all-null maps; Niobrara 75% via seed (`llm: 0`).
- Assumptions died: **A1**.
- Root cause: **lifecycle SIGTERM**, not Qwen. Exit 143 on prior instance was our explicit kill; subsequent deaths were short-shell teardown.
- Sticky takeaway: **Durable services must live in their own Cursor background terminal; never `nohup` inside a shell that will finish this turn.**
- Process change: restart inference only via `block_until_ms: 0`; never `pkill` without an immediate durable replacement already listening.

---

## Example B: Shape of a good vs bad chain

**Bad (shallow):**
“Restart inference with nohup, then run holdout6e.”

**Good (deep):**
Shows world state (how the live process was started), names A1, compares O1 vs O2 against known-good, requires post-shell healthz, and refuses to interpret Connection error as model failure.

---

## Example C: Harvey LAB next run after task-018 fixes (2026-08-14)

### CoT — Arm canonical 001–025 vs 018 smoke vs wait

#### 1. Goal
Verify the four task-018 control-flow fixes before burning a clean Sonnet-judged 001–025 ledger.

#### 2. World state (observed, not hoped)
- Branch `cursor/harvey-lab-three-arm-nemotron-4ff0`; fixes committed (`1fd72da1`); marker **cleared**.
- Live PR smoke [31764087476](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/31764087476): nemotron ± clawql **task 001 only**, still in progress.
- Workflow `cancel-in-progress: true` on `harvey-lab-fk-*` — any new LAB run on this ref cancels the live one.
- Default no-marker path is `MODE=smoke` with judge **`openai/gpt-5.4-mini`**, not Sonnet.
- Batch 3 016–025 already finished same UTC day ([31757993774](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/31757993774)); OpenRouter free tier ~1000 req/day, reset midnight UTC.
- Task 018 failure mode: 0 recalls, 40/40 bash, no write, answer should be 0 of 12.

#### 3. Evidence so far
- Unit tests green for ceiling / require-recall / frequency helpers.
- 001 is a known ClawQL all-pass path (batch 2) — good regression probe for “patch still applies,” weak probe for frequency/ceiling.
- Sweep marker `18-18` is the known-good way to get Sonnet + single task without a 50-job matrix.

#### 4. Assumptions
| # | Assumption | If false | Falsify |
|---|------------|----------|---------|
| A1 | Clearing the marker made this PR smoke Harvey-parity (Sonnet) | Mini-judge scores ≠ ledger scores | Read resolve-matrix else-branch |
| A2 | Same-day quota can absorb 001–025 (50 jobs) after batch 3 | Mid-matrix rate-limit / cancelled cells | Check OR headers or wait until 00:00 UTC |
| A3 | Task 001 smoke is enough to greenlight canonical | 018-class still fails; ledger polluted | Require 018 Sonnet cell first |

A1 is **false** (workflow defaults smoke → gpt-5.4-mini). A3 is **false** for the failure we just fixed.

#### 5. Hypotheses
- H1: Fixes work; 018 would write `0 of 12` with ≥1 recall.
- H2: Fixes partially work (writes something) but wrong answer / no recall.
- H3: Arming 001–025 tonight dies on OpenRouter quota mid-matrix (infra), misread as model regression.

#### 6. Options
| Option | Durability | Blast radius | Time | Notes |
|--------|------------|--------------|------|-------|
| O1 Push `.run-nemotron-sweep` = `1-25` now | Low tonight | Cancels 001 smoke; 50 jobs; quota | Hours | Shortcut to “canonical” |
| O2 Cancel 001; push `18-18` immediately | Medium | Cancels live smoke | ~40min | Right task, wrong timing vs in-flight |
| O3 Let 001 smoke finish; then arm `18-18` Sonnet; only then `1-25` after quota OK | High | Two small matrices | Wait + 018 + later | Known-good marker pattern |
| O4 Skip 018; trust unit tests → 1-25 after midnight | Medium | No in-vivo 018 proof | Overnight | Faster canonical, weaker gate |

#### 7. Decision
Pick: **O3**.
Because: separates layers — (a) patch-apply regression on 001, (b) failure-mode probe on 018, (c) ledger only after both + quota.
Rejected: O1 (A2/A3 untested; cancel-in-progress burns the live probe). O2 (needlessly kills 001). O4 (skips the only task that exercises Fixes 1–2–4).
Risk accepted: wall-clock delay until 001 completes and possibly until UTC midnight.
Rollback: if 001 fails on require-recall/patch, fix before any sweep marker.

#### 8. First verification
When 001 clawql job completes: log contains `ClawQL require-recall`; deliverable exists; no cancel. Then `18-18` marker: scorecard not empty-write; transcript shows `memory_recall` and/or ceiling nudge if turns climb.

#### 9. Stop conditions
- Rate-limit / connection errors mid-001 → do not interpret as prompt regression; wait for reset.
- 018 still 0% with no write after fixes → do not arm 1–25; re-open Fix 1/2.
- 018 writes but wrong non-zero → Fix 2/4 prompt issue, not ceiling.

### After-action — doc/skill push cancelled live 001 smoke

- Expected: Path filter skips harvey-lab when only `.cursor/` + `docs/` change.
- Observed: Push `7ce9f686` re-fired LAB; [31764087476](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/31764087476) **cancelled**; [31764224376](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/31764224376) restarted 001 smoke.
- Assumptions died: path filter protects mid-smoke “unrelated” pushes on this PR.
- True root cause: **GHA lifecycle** — `pull_request` path filters use the **full PR diff vs base**; once the PR touches `integrations/harvey-labs/**`, every synchronize re-runs LAB + `cancel-in-progress`.
- Sticky takeaway: **On a harvey-labs PR, never push while a LAB matrix is in progress — even docs/skills.**
- Process change: before any `git push`, `gh run list --workflow=harvey-lab-firm-knowledge.yml` must show no `in_progress` on this branch.

### After-action — (pending 001 replacement + 018 results)
Fill after [31764224376](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/31764224376) and a later `18-18` complete.

### After-action — 18-18 re-probe [31767832459](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/31767832459) (Fix 5)

- Expected: cohort recall returns ~12 B&F credit facilities; write `0 of 12`.
- Observed: structured `practiceArea` / title filters → **0 hits**; 4 recalls + 31 bash; ceiling nudge at 37 **ignored**; **no write**; 40/40.
- Assumptions died: vault already encodes Banking & Finance (false — ingest hard-coded `practice=Other`).
- True root cause: **data/ontology seeding** (layer below prompt), not model refusal to write zero.
- Sticky takeaway: **Do not prompt agents to filter on ontology fields you never seed.**
- Process change: Fix 6 — detect credit-agreement paths → `CREDIT_FACILITY` + Banking & Finance; Pattern F; re-nudge ceiling every remaining turn.

