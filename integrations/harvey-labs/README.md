# Harvey LAB × ClawQL integration

Adapter overlay for [`harveyai/harvey-labs`](https://github.com/harveyai/harvey-labs) so ClawQL vault memory + MCP tools can be evaluated on the **`firm-knowledge`** task family (250 tasks, shared Calderwood & Harkness DMS).

## Three arms → Nemotron pair first

| Arm | Model flag | Meaning | Needs Anthropic? |
| --- | ---------- | ------- | ---------------- |
| `nemotron` | `openrouter/<nemotron>` | Nemotron, no ClawQL | **No** |
| `nemotron-clawql` | `clawql-cc/<nemotron>` | Nemotron + ClawQL | **No** |
| `baseline` / `clawql` | Claude | Opus/Sonnet A/B | Yes |

Publishable Claude A/B is Opus vs Opus (later). Nemotron pair compounds Harvey/Trajectory’s LAB post-train (published **8.3% all-pass**) with/without ClawQL retrieval — judge `openai/gpt-5.4-mini` via OpenRouter.
## Run path: GitHub Actions (preferred)

Same as OpenBench: use repo secret **`OPENROUTER_API_KEY`**. Do not depend on Cursor Cloud Agent env secrets.

```bash
# ★ Nemotron ± ClawQL (OpenRouter only — no Anthropic)
gh workflow run harvey-lab-firm-knowledge.yml \
  --ref cursor/harvey-lab-three-arm-nemotron-4ff0 \
  -f task=firm-knowledge/tasks/001 \
  -f arms=nemotron,nemotron-clawql \
  -f nemotron_model=nvidia/nemotron-3.5-lightning:free \
  -f judge_model=openai/gpt-5.4-mini \
  -f max_turns=15 \
  -f max_matters=5
```

Workflow defaults: **`nemotron,nemotron-clawql`** + **`openai/gpt-5.4-mini`** judge.  
Pause / resume: [`docs/benchmarks/harvey-lab-pause-handoff.md`](../../docs/benchmarks/harvey-lab-pause-handoff.md)  
Plan reconciliation: [`docs/benchmarks/harvey-lab-action-plan.md`](../../docs/benchmarks/harvey-lab-action-plan.md)

## Durable traces (Cloudflare R2)

Every live GHA cell uploads `transcript.jsonl` (plus scores/metrics/config) to **`clawql-openbench-traces`** under `raw/harvey-lab/YYYY/MM/DD/run-<gha_run_id>/<arm>/<task_id>/`. GitHub artifacts stay a 30-day warm cache. Same Cloudflare secrets as OpenBench (`CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID`). Local `run-lab-local.sh` uploads when those env vars are present (and also ships `calls.jsonl` from clawql-inference when it exists). Missing R2 secrets **fail the GHA cell**; locally they warn and continue unless `CLAWQL_HARVEY_LAB_REQUIRE_DURABLE_TRACES=1`.

## What this provides

| Path | Purpose |
| ---- | ------- |
| `harness/adapters/clawql.py` | Anthropic + MCP tools + pre-ingest / cleanup |
| `harness/adapters/clawql_chat.py` | OpenRouter chat completions + same vault/MCP (Arm C) |
| `harness/adapters/clawql_lab_session.py` | Shared vault / ingest / MCP session |
| `harness/adapters/clawql_openrouter.py` | OpenRouter Anthropic + OpenAI clients |
| `harness/adapters/clawql_system_prompt.md` | Recall-first guidance for ClawQL arms |
| `harness/clawql_tools.py` | Routes `clawql_*` → MCP |
| `scripts/apply_clawql_adapter.py` | Copies + patches into a harvey-labs checkout |
| `scripts/run-lab-gha.sh` | GHA entrypoint (clone, arms, scorecard) |
| `scripts/run-lab-local.sh` | Local Mac entrypoint (uploads traces to R2 when CF creds are set) |
| `../../scripts/dev/upload-harvey-lab-cell-to-r2.py` | Per-cell Cloudflare R2 upload (same layout as harvest) |
| `tests/test_vault_isolation.py` | Task-scoped vault isolation unit tests |
| `../../scripts/start-clawql-for-lab.sh` | Task-scoped vault + MCP HTTP startup |

## Firm-knowledge specifics

- Tasks: `tasks/firm-knowledge/tasks/<id>/task.json` (**250**)
- Documents: shared DMS via `docs_dir: "../../dms"` (~266 matters, ~9k files)
- Pre-ingest seeds priority docs per matter (not every binary)
- Vault isolation is per task (delete/recreate)

## Phases (cost discipline)

| Phase | Model | Scope |
| ----- | ----- | ----- |
| A–D | Sonnet (OpenRouter) | 1→few tasks, isolation, prompt |
| E | Opus A/B (+ Nemotron C) | Publishable ledger |
| Judge | Sonnet | Always |

Immediate LAB does **not** require our own DPO/GRPO — Arm C uses NVIDIA/Trajectory post-train + ClawQL.

## Results ledgers

- `docs/benchmarks/harvey-lab-baseline.md`
- `docs/benchmarks/harvey-lab-clawql-results.md`
- `docs/benchmarks/harvey-lab-ouroboros-grounding-wonder.md` — Wonder / anti-hallucination + batch-2 smoke gate + public run-ID framing
- `docs/benchmarks/harvey-lab-pause-handoff.md`
- `docs/benchmarks/harvey-lab-action-plan.md`

Do not outreach to Harvey until a multi-task **Sonnet-judged** ledger exists with public Actions run IDs (Arm C Nemotron pair preferred for efficiency story; Opus for absolute quality).
