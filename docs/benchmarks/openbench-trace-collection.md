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

## RTP alignment

OpenBenchTrace is the **outer** benchmark envelope. The Reasoning Trace Protocol
(RTP) is the **inner** reasoning structure. They compose: a publishable
OpenBenchTrace record should wrap an RTP-compatible session.

| OpenBenchTrace field(s) | RTP counterpart |
| ----------------------- | --------------- |
| Task prompt / first user message | Intent (`rawPrompt`, `parsedGoal`) |
| `memory_recall` / `search` (and similar) in `tool_calls` | Retrieval |
| Assistant reasoning before tool selection | Reasoning (`seedChain`, `selectedTool`) |
| `tool_calls[]` | Execution (`toolName`, payload) |
| Pre/post state hashes (when present) | Delta |
| `verdict` + `verdict_source: grader` | Verdict (`evaluatorTier` 1 = deterministic grader, 2 = semantic) |
| `content_hash` / Merkle batch chain | RTP turn hash chaining |
| (planned) job-start consent JWT | `consentToken` (`community_model`, `dataset_licensing`) |

v1.0 today stores OpenAI-shaped `messages` + `tool_calls` without an explicit
`turnSequence` object. Prefer writers that can project those fields into RTP’s
six-node sequence so every suitable training row is both an OpenBench cell and
an RTP training example. Domain-agnostic RTP (IDP, combat, debugging, …) is what
makes a multi-domain fine-tune learn transferable reasoning, not only
ClawQL tool sequences.

Schema governance (RTP) and agent coordination (ClawQL) both use NSV/SGDOP —
dataset coverage of reasoning space vs ensemble coverage of representation
space. Same blind-spot geometry; different recruitment action (schema node vs
model).

## Required secrets / variables

Same Cloudflare secrets as **`clawql sync ensure`** for the team vault. Sync
auto-creates the dedicated traces bucket (`clawql-openbench-traces` by default)
and uploads via the Cloudflare R2 REST API — **no extra R2 S3 secrets required**.

| Name                                                                      | Kind     | Purpose                                                                                                                                                                |
| ------------------------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CLOUDFLARE_API_TOKEN` or `CLAWQL_CLOUDFLARE_API_TOKEN`                   | secret   | Account token with **Workers R2 Storage Write** (bucket create + object put)                                                                                           |
| `CLOUDFLARE_ACCOUNT_ID` or `CLAWQL_R2_ACCOUNT_ID`                         | secret   | R2 account id — **required**; token alone is not enough. Verified working on [30977578882](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30977578882). |
| `CLAWQL_R2_TRACES_BUCKET` or `CLAWQL_OPENBENCH_R2_BUCKET`                 | secret   | Optional override (default **`clawql-openbench-traces`**)                                                                                                              |
| `CLAWQL_SYNC_ACCESS_KEY_ID` + `CLAWQL_SYNC_SECRET_ACCESS_KEY` (or `R2_*`) | secret   | Optional — prefer S3 put when already present from team sync                                                                                                           |
| `CLAWQL_OPENBENCH_REQUIRE_DURABLE_TRACES`                                 | variable | Default **fail-loud** (`1`). Set `0` only for emergency dry-runs                                                                                                       |
| `CLAWQL_ENABLE_PRESIDIO`                                                  | variable | `1` to also run Presidio at write time (needs analyzer URLs)                                                                                                           |

Do **not** point traces at `CLAWQL_SYNC_BUCKET` (team Memory vault). Traces use a
separate bucket so FT corpus and vault notes stay isolated.

Local redaction (`openbench-local-v1`) always runs — API keys, emails, Slack
tokens, etc. Presidio is additive when enabled.

## CI wiring

Composite action: [`.github/actions/openbench-durable-traces`](../../.github/actions/openbench-durable-traces/action.yml)

Used by `openbench-ab.yml` and `openbench-ouroboros-ab.yml` **after** the A/B
step and **before** artifact upload. Durable sync failure fails the job.

### Inference call store (companion)

Still set before `inference serve`:

| Env                           | Value                      |
| ----------------------------- | -------------------------- |
| `CLAWQL_INFERENCE_STORE`      | `jsonl`                    |
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
