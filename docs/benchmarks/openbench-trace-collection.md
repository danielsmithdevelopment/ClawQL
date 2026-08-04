# OpenBench trace collection (fine-tune flywheel)

Every live OpenBench cell already routes chat completions through
`clawql inference serve`. Completions append `InferenceRecord` rows to the
**inference call store**. On GitHub Actions the runner is ephemeral — without
an explicit JSONL path those records never leave the job.

This document is the day-one collection path. Full fine-tune A/B (suite B-1)
still waits on a registered LoRA; collection does **not**.

## Correct environment variables

| Variable | Value in OpenBench CI |
| -------- | --------------------- |
| `CLAWQL_INFERENCE_STORE` | `jsonl` |
| `CLAWQL_INFERENCE_STORE_PATH` | `$GITHUB_WORKSPACE/artifacts/openbench-ab/<task>/call-store/calls.jsonl` |

There is **no** `CLAWQL_INFERENCE_CALL_STORE_PATH` or
`CLAWQL_INFERENCE_CALL_STORE_VERDICT_FILTER`. Export filters with
`clawql inference export --verdict …` after the fact.

If neither `CLAWQL_HOME` nor `CLAWQL_INFERENCE_STORE_PATH` is set, the store
backend defaults to **`memory`** — that is why CI historically produced zero
durable traces.

## What CI does now

1. **Configure inference call store** — sets the two env vars above before
   `inference serve` starts.
2. **Run A/B** as before; every completion appends to `calls.jsonl`.
3. **Package** via `openbench/scripts/package-openbench-traces.py`:
   - `call-store/calls.jsonl` — raw records (`evaluatorVerdict` usually `none`)
   - `trace-session-labels.json` — grader scores per arm (pass/fail/partial)
   - `call-store/README.md` — pointer for artifact browsers
4. **Upload artifact** `openbench-ab-<task>-<run_id>` with **90-day** retention
   (`if: always()` so failed cells still contribute negative examples).
5. **Optional R2** — if `CLAWQL_OPENBENCH_R2_BUCKET`, `CLOUDFLARE_API_TOKEN`,
   and `CLOUDFLARE_ACCOUNT_ID` secrets exist, the workflow mirrors
   `openbench/<run_id>/<task>/calls.jsonl` into that bucket.

## Pulling traces for export

```bash
# From a completed Actions run
gh run download <run_id> -n openbench-ab-<task>-<run_id> -D /tmp/ob-traces

export CLAWQL_INFERENCE_STORE=jsonl
export CLAWQL_INFERENCE_STORE_PATH=/tmp/ob-traces/call-store/calls.jsonl

# Keep everything during collection; filter later
clawql inference export --output /tmp/ft-dataset.jsonl
# or: clawql inference export --verdict passed --min-score 0.9 --output …

# Join session-level grader labels when selecting training rows
jq . /tmp/ob-traces/trace-session-labels.json
```

## Grader → call-store verdict (gap)

OpenBench checkers already label each arm (score / success_rate). Those labels
land in `trace-session-labels.json` as `arm_labels[].grader_verdict`.

Per-record `evaluatorVerdict` on `InferenceRecord` still defaults to `"none"`
because one inference server serves **both** arms and records are not yet
tagged with arm / trial. Until arm-scoped `team` or `correlationId` prefixes
are wired in `run-ab-compare.py`, treat:

- **call store** = unlabeled trajectories (prompt / tool / response payloads)
- **session labels** = grader signal for filtering which runs to keep

Stamping `evaluatorVerdict` onto records once arm tagging exists is the one
code change that turns this into auto-labeled SFT data.

## Langfuse (optional)

If Langfuse is enabled in the CI environment, also export spans into the same
artifact directory (timings / token counts). Complementary to the call store;
not required for the first fine-tune corpus.

## Volume (order of magnitude)

~40 tasks × 3 replications × on/off ≈ 240 sessions per full matrix. At
15–30 tool calls per session → a few thousand records per matrix. First
fine-tune targets ~500–2,000 high-quality verified rows — a handful of full
matrix runs plus Phase 0 replications of proven cells is enough once export
filtering is in place.

## Related

- Inference store / export: [`docs/inference/clawql-inference.md`](../inference/clawql-inference.md)
- Flywheel suite plan: [`openbench-advanced-suites.md`](./openbench-advanced-suites.md) (B-1)
- Workflow: [`.github/workflows/openbench-ab.yml`](../../.github/workflows/openbench-ab.yml)
