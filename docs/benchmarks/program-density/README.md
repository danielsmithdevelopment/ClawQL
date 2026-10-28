# Program density — durable parked agents (fair contract)

Cross-system board for **parked** durable agents with a shared agent shape and shared columns. See [`STATUS.md`](./STATUS.md) and the shared-host checklist [`SHARED_HOST.md`](./SHARED_HOST.md).

```bash
npm run benchmark:program-density-fair
# SHARED_HOST deadline arms (scaled bursts + deadline restart):
node --expose-gc --import tsx scripts/benchmarks/program-density/measure-shared-host-deadline.mjs
```

Writes [`evidence-fair.json`](./evidence-fair.json).

**Not this board:** Bun/Node Ready RSS and `_streamMapping` plateau — [memory-plateau.md](../cloudflare-multiturn/memory-plateau.md).
