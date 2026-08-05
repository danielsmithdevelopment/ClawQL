# openbench-dataset

**OpenBenchTrace protocol** — turn agent benchmark runs into publishable,
fine-tuning-ready datasets with write-time scrubbing and WORM manifests.

ClawQL ships this package as the **reference implementation**. The intended
home is upstream OpenBench (`openbench export`). See:

- Product: [`docs/benchmarks/openbench-dataset-product.md`](../../docs/benchmarks/openbench-dataset-product.md)
- Upstream proposal: [`docs/benchmarks/openbench-dataset-upstream-proposal.md`](../../docs/benchmarks/openbench-dataset-upstream-proposal.md)
- Schema: [`schema/openbench-trace.v1.json`](./schema/openbench-trace.v1.json)

## Install / build

```bash
npm install
npm run build -w openbench-dataset
npm test -w openbench-dataset
```

## Library

```ts
import { LocalFsBackend, TraceWriter, collectFromResults, syncDatasetPack } from "openbench-dataset";

await collectFromResults({ artifactDir: "...", runId: "123", taskId: "search-first-discovery" });
await syncDatasetPack({ datasetDir: ".../dataset", runId: "123", taskId: "search-first-discovery" });
```

## CLI

```bash
npm run build -w openbench-dataset

node packages/openbench-dataset/dist/cli.js collect \
  --artifact-dir artifacts/openbench-ab/<task> \
  --run-id "$GITHUB_RUN_ID" --task <task>

node packages/openbench-dataset/dist/cli.js sync \
  --artifact-dir artifacts/openbench-ab/<task> \
  --run-id "$GITHUB_RUN_ID" --task <task>

node packages/openbench-dataset/dist/cli.js export \
  --source ./dataset/traces --output ./hf-dataset --verdict pass
```

## Durable R2 (same secrets as `clawql sync ensure`)

`sync` auto-creates bucket **`clawql-openbench-traces`** (override with
`CLAWQL_R2_TRACES_BUCKET`) and uploads when either:

1. **`CLOUDFLARE_API_TOKEN` + account id** — Workers R2 Storage Write (REST put; no extra R2 S3 secrets), or
2. Existing **`CLAWQL_SYNC_*` / `R2_*` S3 keys** (optional prefer path)

Do not reuse the team Memory vault bucket (`CLAWQL_SYNC_BUCKET`).

## Status

| Piece | Status |
| ----- | ------ |
| OpenBenchTrace v1.1 types + JSON Schema (RTP inner) | ✅ |
| RTP project + consent JWT + turn hashing | ✅ |
| Local scrub + TraceWriter + local backend | ✅ |
| `collect` from OpenBench `results.json` | ✅ |
| S3/R2 backend + `sync` (CF API ensure + REST put) | ✅ |
| HF export CLI | ✅ |
| Arm-scoped correlation (`openbench/{arm}/{trial}/{run}`) | ✅ |
| Upstream OpenBench landing | ⏳ proposal drafted |

## License

Apache-2.0
