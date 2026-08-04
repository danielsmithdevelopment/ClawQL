# OpenBench trace collection (publish-ready fine-tune corpus)

R2 is the **corpus of record**. GitHub Actions artifacts are a **90-day warm
cache** for active debugging — not the source of truth.

Every live OpenBench cell must leave behind schema-validated, write-time-scrubbed
traces + a WORM batch manifest. A run that finishes without durable persistence
is treated as a failed job (wasted compute).

## Architecture

```text
clawql inference serve  →  call-store JSONL (workspace)
        ↓
OpenBench grader / results.json
        ↓
build-openbench-dataset.py
  · OpenBenchTrace v1.0 per trial
  · local redaction policy (always)
  · Presidio when CLAWQL_ENABLE_PRESIDIO=1
  · JSON Schema validation (fail closed)
  · WORM MANIFEST.json
        ↓
sync-openbench-traces-durable.sh  →  R2 (required)
        ↓
actions/upload-artifact             →  90d warm cache
```

### R2 layout

```text
$CLAWQL_R2_TRACES_BUCKET/
  raw/YYYY/MM/DD/run-<run_id>/<task>/
    <task>-on-001.jsonl
    <task>-off-001.jsonl
    call-store/calls.jsonl
  manifests/YYYY/MM/DD/run-<run_id>-<task>.json
  schema/v1.0.json
  exports/training/          # future: clawql inference export output
  exports/public/            # future: release scrub pass
```

## Schema (v1.0)

- JSON Schema: [`openbench/schema/openbench-trace.v1.json`](../../openbench/schema/openbench-trace.v1.json)
- TypeScript: [`openbench/schema/openbench-trace.v1.ts`](../../openbench/schema/openbench-trace.v1.ts)
- Changelog: [`openbench/schema/CHANGELOG.md`](../../openbench/schema/CHANGELOG.md)

Stable enough that August 2026 traces remain usable for an October fine-tune and
a later public release. Bump the schema version (and changelog) for breaking
field changes — do not silently reshape v1.0.

## Required secrets / variables

| Name | Kind | Purpose |
| ---- | ---- | ------- |
| `CLAWQL_R2_TRACES_BUCKET` (preferred) or `CLAWQL_OPENBENCH_R2_BUCKET` / `CLAWQL_SYNC_BUCKET` | secret | Durable bucket |
| `CLOUDFLARE_ACCOUNT_ID` or `CLAWQL_R2_ACCOUNT_ID` | secret | R2 account |
| `CLAWQL_SYNC_ACCESS_KEY_ID` + `CLAWQL_SYNC_SECRET_ACCESS_KEY` (or `R2_*`) | secret | S3 API keys |
| `CLAWQL_OPENBENCH_REQUIRE_DURABLE_TRACES` | variable | Default **fail-loud** (`1`). Set `0` only for emergency dry-runs |
| `CLAWQL_ENABLE_PRESIDIO` | variable | `1` to also run Presidio at write time (needs analyzer URLs) |

Local redaction (`openbench-local-v1`) always runs — API keys, emails, Slack
tokens, etc. Presidio is additive when enabled.

## CI wiring

Composite action: [`.github/actions/openbench-durable-traces`](../../.github/actions/openbench-durable-traces/action.yml)

Used by `openbench-ab.yml` and `openbench-ouroboros-ab.yml` **after** the A/B
step and **before** artifact upload. Durable sync failure fails the job.

### Inference call store (companion)

Still set before `inference serve`:

| Env | Value |
| --- | ----- |
| `CLAWQL_INFERENCE_STORE` | `jsonl` |
| `CLAWQL_INFERENCE_STORE_PATH` | `…/call-store/calls.jsonl` |

Scrubbed copy lands under `raw/…/call-store/calls.jsonl`. Session/trial records
in `OpenBenchTrace` are the primary fine-tune/public schema; call-store is the
raw completion companion until arm-scoped correlation tagging lands.

## Open-source release path

Keep **`raw/` private** while iterating. When FT proves lift:

1. Belt-and-suspenders Presidio pass over `raw/`
2. Filter `suitable_for_training: true`
3. Strip/replace internal ids for public (`run_id` → opaque dataset id)
4. Write `exports/public/clawql-openbench-vN.jsonl`
5. Publish to Hugging Face Datasets (`…/clawql-openbench`) with a datasheet
6. License: Apache-2.0 (matches code) + cite via manifest provenance

Datasheet should cover tasks, models, grader criteria, redaction policy hash,
schema version, and what `suitable_for_training` removes.

## Local build (no R2)

```bash
pip install jsonschema
python3 openbench/scripts/build-openbench-dataset.py \
  --artifact-dir artifacts/openbench-ab/<task> \
  --run-id local --task <task> --require-nonempty

CLAWQL_OPENBENCH_REQUIRE_DURABLE_TRACES=0 \
  openbench/scripts/sync-openbench-traces-durable.sh \
  --artifact-dir artifacts/openbench-ab/<task> \
  --run-id local --task <task>
```

## Related

- Product / managed service: [`openbench-dataset-product.md`](./openbench-dataset-product.md)
- Upstream proposal: [`openbench-dataset-upstream-proposal.md`](./openbench-dataset-upstream-proposal.md)
- Package: [`packages/openbench-dataset`](../../packages/openbench-dataset/)
- Inference export / FT flywheel: [`docs/inference/clawql-inference.md`](../inference/clawql-inference.md)
- Advanced suites (B-1): [`openbench-advanced-suites.md`](./openbench-advanced-suites.md)
