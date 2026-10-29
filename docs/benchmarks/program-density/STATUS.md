# Durable-agent density — cross-system comparison

**Status:** Both pumps are fast; residual is the durable write path. Under-load sync **p50 ≈ probe** on this host (~1.08×); **fdatasync + prealloc did not close the gap** (~+3%). Campaign still valid. Evidence: [`evidence-fair.json`](./evidence-fair.json). Contract: [`SHARED_HOST.md`](./SHARED_HOST.md).

**Related:** [durability-proof STATUS](../durability-proof/STATUS.md) · Ready RSS boards are different ([memory-plateau.md](../cloudflare-multiturn/memory-plateau.md)).

## Public claim (Ontologiql — publishable capacity/wake; deadlines = lab until shared-host)

> On one node, Ontologiql held 200,000 parked agents, each with a 20-turn history and a pending tool call, within a 512 MiB process memory ceiling, with state stored on disk at about 30 KiB per agent. A parked agent woke in under 0.6 ms at p99 with a cold cache, and under 35 µs with its state cached. Parked agents survived a restart.

## Where each side stands

| Contract                     | ClawQL                                                              | Ontologiql                                                          |
| ---------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Serial fsync (board-matched) | ~7.7k/s; p50 ~0.113 ms                                              | ~8.9k/s (~112 µs); overwrite ~50k **retracted**                     |
| Pump profile                 | pop/encode ruled out (~1.3M/s noop); durable ~286k/s                | producer ~0.46 µs/rec (~0.06% wall); durable-wait ~62%              |
| Double-buffer                | Active; fsync rate flat                                             | **double_buffer_candidate_unverified** (profile first)              |
| Under-load sync vs probe     | p50 **~1.08×** probe; p99 ~2×                                       | (peer should record the same)                                       |
| fdatasync + prealloc arm     | Sustained / fsyncs **~+3%** — **does not close the gap** on this host | Trial the same before assuming idle-writer                          |

## ClawQL: durable-path residual (after double-buffer + metadata arms)

| Measure                         | Result                                      |
| ------------------------------- | ------------------------------------------- |
| Probe serial p50 / p99          | ~0.113 / ~0.412 ms                          |
| Focus-window sync p50 / p99     | ~0.123 / ~0.83 ms (~1.08× / ~2×)            |
| fsyncs/sec (focus)              | ~3.5–3.7k (~46–49% of serial)               |
| fsync_append sustained          | ~228k/s                                     |
| fdatasync_append                | ~236k/s (**+3.5%**)                         |
| fdatasync_prealloc              | ~233k/s (**+2.1%**)                         |
| Diagnosis                       | `durable_path_residual_not_explained_by_metadata_arms_alone` |

Growing-file metadata was the leading suspect (append+fsync updates size/blocks each sync). On **this** cloud-agent disk, under-load p50 is not 2–4× the probe, and the experimental arms do not move sustained rate or fsyncs/sec enough to explain the ~50% serial gap. Residual is still in the durable path (write + event-loop cycle around sync; p99 spikes) — not producer CPU, not missing double-buffer, not (here) metadata-only.

Artifacts: [`fsync-ceiling.json`](./fsync-ceiling.json) · [`fsync-metadata-arms.json`](./fsync-metadata-arms.json) · [`flush-batch-stats.json`](./flush-batch-stats.json) · [`pump-profile.json`](./pump-profile.json).

## Shared-host campaign (unblocked for compare)

Same measurement contract. Interleaved 3-rep on the **dedicated** host with write-cache recorded. Re-run under-load latency vs probe and the fdatasync/prealloc arms there — a different disk may show the metadata tax this host does not.

```bash
npm run benchmark:program-density-fsync-ceiling
npm run benchmark:program-density-fsync-metadata-arms
npm run benchmark:program-density-flush-stats
npm run benchmark:program-density-pump-profile
CLAWQL_DENSITY_REPS=3 \
CLAWQL_DENSITY_FSYNC_CEILING_JSON=docs/benchmarks/program-density/fsync-ceiling.json \
  npm run benchmark:program-density-shared-host
```

## Board snapshot

| System           | Status                                                                 | Notes                         |
| ---------------- | ---------------------------------------------------------------------- | ----------------------------- |
| Ontologiql       | Lab; serial fixed; producer fast; dbuf candidate unverified            | Same latency/arms checklist   |
| ClawQL           | Dbuf on; metadata arms neutral here; durable-path residual labeled     | Campaign-ready for compare    |
| Golem / Infinity | Pending invite                                                         | fair-v2 / SHARED_HOST         |
