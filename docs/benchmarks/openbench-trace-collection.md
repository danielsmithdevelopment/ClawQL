# OpenBench trace collection (fine-tune flywheel)

Every live OpenBench cell already routes chat completions through
`clawql inference serve`. Completions append `InferenceRecord` rows to the
**inference call store**. On GitHub Actions the runner is ephemeral — without
an explicit JSONL path those records never leave the job.

Full fine-tune A/B (suite B-1) still waits on a registered LoRA; **collection
does not**.

## Two sinks (do not confuse them)

| Sink | Lifetime | Role |
| ---- | -------- | ---- |
| **GitHub Actions artifact** | ~90 days | Convenient debug cache; not the corpus |
| **R2 durable pack** | Until you delete it | **Corpus of record** — grows with every live run |

Without R2 credentials configured, you only have the 90-day cache and **will**
need to re-run cells after expiry. Set the secrets below once and the dataset
accumulates for free.

## Correct environment variables (per job)

| Variable | Value in OpenBench CI |
| -------- | --------------------- |
| `CLAWQL_INFERENCE_STORE` | `jsonl` |
| `CLAWQL_INFERENCE_STORE_PATH` | `…/artifacts/…/call-store/calls.jsonl` |

There is **no** `CLAWQL_INFERENCE_CALL_STORE_PATH` or
`CLAWQL_INFERENCE_CALL_STORE_VERDICT_FILTER`. Export filters with
`clawql inference export --verdict …` after the fact.

If neither `CLAWQL_HOME` nor `CLAWQL_INFERENCE_STORE_PATH` is set, the store
backend defaults to **`memory`** — that is why CI historically produced zero
durable traces.

## What CI does now

1. Point inference at a workspace JSONL path before `inference serve`.
2. Run A/B; every completion appends to `calls.jsonl`.
3. Package via `openbench/scripts/package-openbench-traces.py`:
   - `call-store/calls.jsonl`
   - `trace-session-labels.json` (grader scores per arm)
4. **Sync durable pack to R2** via
   `openbench/scripts/sync-openbench-traces-durable.sh` (S3-compatible API).
5. Upload the Actions artifact as a 90-day cache (`if: always()`).

### R2 object layout (immutable)

```text
s3://$BUCKET/openbench-traces/<run_id>/<task>/
  calls.jsonl
  trace-session-labels.json
  results.json
  summary.md
  MANIFEST.json
```

Prefix override: repo variable `CLAWQL_OPENBENCH_R2_PREFIX` (default
`openbench-traces`).

### Secrets / variables to set (once)

Prefer the same S3 API keys you already use for `clawql sync`:

| Secret / var | Purpose |
| ------------ | ------- |
| `CLAWQL_OPENBENCH_R2_BUCKET` or `CLAWQL_SYNC_BUCKET` | Target bucket |
| `CLOUDFLARE_ACCOUNT_ID` or `CLAWQL_R2_ACCOUNT_ID` | R2 account |
| `CLAWQL_SYNC_ACCESS_KEY_ID` / `CLAWQL_SYNC_SECRET_ACCESS_KEY` (or `R2_*`) | S3 API keys |
| `CLAWQL_OPENBENCH_REQUIRE_DURABLE_TRACES` (repo **variable**, `1`) | Fail the job if R2 is not configured — recommended once you care about growth |

Until require=1, missing creds only emit a warning and you silently keep the
90-day-only path.

## Growing the corpus

Volume scales with **live cells you actually run**:

- Put tasks on `pr_active`, or
- `workflow_dispatch` (`all` / `all-including-retired` / n=3 Phase 0)

Each full matrix × replications adds thousands of records. Failed cells are
kept on purpose (negative examples).

List what you have:

```bash
aws s3 ls "s3://$BUCKET/openbench-traces/" --endpoint-url "https://$ACCOUNT.r2.cloudflarestorage.com"
```

## Export for fine-tune

```bash
# Pull one pack
aws s3 sync \
  "s3://$BUCKET/openbench-traces/<run_id>/<task>/" \
  /tmp/ob-traces/ \
  --endpoint-url "https://$ACCOUNT.r2.cloudflarestorage.com"

export CLAWQL_INFERENCE_STORE=jsonl
export CLAWQL_INFERENCE_STORE_PATH=/tmp/ob-traces/calls.jsonl

# Keep everything during collection; filter later
clawql inference export --output /tmp/ft-dataset.jsonl
# or: --verdict passed --min-score 0.9

jq . /tmp/ob-traces/trace-session-labels.json
```

## Grader → call-store verdict (gap)

OpenBench checkers label each arm in `trace-session-labels.json`
(`arm_labels[].grader_verdict`). Per-record `evaluatorVerdict` on
`InferenceRecord` still defaults to `"none"` until arm-scoped `team` /
`correlationId` tagging lands in `run-ab-compare.py`.

## Open-sourcing the dataset (later)

Plan: keep the **raw R2 corpus private** while iterating; publish a **scrubbed,
versioned release** once fine-tune value is proven.

| Gate | Why |
| ---- | --- |
| Only OpenBench / synthetic tasks | No customer or tenant production traffic |
| `clawql inference export` with Presidio PII scrub on | Default export path already scrubbing |
| Join grader labels; prefer passed / high-score rows | Quality bar for public SFT |
| Versioned HF dataset or GitHub Release assets | Reproducible `clawql-openbench-traces-vN` |
| License (e.g. CC-BY-4.0 or Apache-2.0) + model card | Attribution + intended use |
| Exclude secrets / API keys / real Slack tokens | OpenBench stubs only — still scan |

Do **not** open-source the raw private bucket wholesale. Publish curated export
snapshots after the first internal fine-tune proves lift (suite B-1).

## Langfuse (optional)

Complementary span timings / token counts. Not required for the first corpus.

## Related

- Inference store / export: [`docs/inference/clawql-inference.md`](../inference/clawql-inference.md)
- Flywheel suite plan: [`openbench-advanced-suites.md`](./openbench-advanced-suites.md) (B-1)
- Workflows: [`openbench-ab.yml`](../../.github/workflows/openbench-ab.yml),
  [`openbench-ouroboros-ab.yml`](../../.github/workflows/openbench-ouroboros-ab.yml)
