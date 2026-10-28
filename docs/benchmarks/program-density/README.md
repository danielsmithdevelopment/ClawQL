# Program density — durable parked agents (fair contract)

Cross-system board for **parked** durable agents with a shared agent shape and shared columns. See [`STATUS.md`](./STATUS.md) and the shared-host checklist [`SHARED_HOST.md`](./SHARED_HOST.md).

```bash
npm run benchmark:program-density-fair
# SHARED_HOST campaign (see SHARED_HOST.md): fsync ceiling → 3-rep floor → alternate systems → peer merge
npm run benchmark:program-density-fsync-ceiling
CLAWQL_DENSITY_REPS=3 CLAWQL_DENSITY_FSYNC_CEILING_JSON=docs/benchmarks/program-density/fsync-ceiling.json \
  npm run benchmark:program-density-shared-host
```

Writes [`evidence-fair.json`](./evidence-fair.json). Headlines use the **3-rep floor**; single-run harness snapshots are not board numbers.

**Not this board:** Bun/Node Ready RSS and `_streamMapping` plateau — [memory-plateau.md](../cloudflare-multiturn/memory-plateau.md).
