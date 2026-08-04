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
import { LocalFsBackend, TraceWriter, exportHuggingFaceDataset } from "openbench-dataset";

const backend = new LocalFsBackend("/tmp/ob-corpus");
const writer = new TraceWriter(backend, {
  dayPrefix: "2026/08/04",
  runId: "123",
  taskId: "search-first-discovery",
});
await writer.writeTrace({ /* OpenBench trial fields */ });
await writer.writeManifest();
```

## CLI

```bash
openbench-dataset export --source ./traces --output ./hf-dataset --verdict pass
```

## Status

| Piece | Status |
| ----- | ------ |
| OpenBenchTrace v1 types + JSON Schema | ✅ |
| Local scrub + TraceWriter + local backend | ✅ |
| HF export CLI | ✅ stub |
| S3/R2 backend in-package | ⏳ use ClawQL durable sync script for now |
| Upstream OpenBench landing | ⏳ proposal drafted |

## License

Apache-2.0
