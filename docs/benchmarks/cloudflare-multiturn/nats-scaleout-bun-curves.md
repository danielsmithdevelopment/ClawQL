# NATS scale-out — Bun --smol (Cloudflare known-op)

Measured on the **same Cloudflare zone-audit known-op** as the single-instance HTTP curves, with **Bun --smol** replicas and NATS queue-group sticky assign. Replica count is **swept**, not assumed.

Artifact: [`nats-scaleout-bun-curves.json`](./nats-scaleout-bun-curves.json) · harness: `scripts/benchmarks/clawql-nats-scaleout-curves.mjs`

## Host

|         |                                       |
| ------- | ------------------------------------- |
| `nproc` | **4**                                 |
| Bun     | 1.4.3 `--smol`                        |
| Step    | 10 s · p99 cutoffs 100 / 250 / 500 ms |

**8 replicas on 4 cores contend.** That is why 8× is not automatically better — measure it.

## Sustained clients by worker count

| Workers | @100 ms | @250 ms | @500 ms |  Peak RPS |
| ------: | ------: | ------: | ------: | --------: |
|       1 |      85 |     202 |     430 |     1 824 |
|       2 |     107 | **322** |     507 | **3 004** |
|   **4** | **134** |     283 | **596** |     2 623 |
|       8 |     128 |     289 |     415 |     2 179 |

**Best by cutoff:** 4× @100 → **134** · 2× @250 → **322** · 4× @500 → **596**.

## vs single-instance Bun (Topology A)

Published multiplex curve (same workflow): **82 / 211 / 434** at 100 / 250 / 500.

This scale-out run’s 1× arm landed **85 / 202 / 430** (same ballpark). Scale-out **beats** 1× at every cutoff when you pick the best worker count:

| Cutoff | Single Bun (this run) | Best NATS scale-out |
| -----: | --------------------: | ------------------: |
| 100 ms |                    85 |        **134** (4×) |
| 250 ms |                   202 |        **322** (2×) |
| 500 ms |                   430 |        **596** (4×) |

## What to retire / relabel

| Number           | What it was                                                                                    | Action                                                                    |
| ---------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| **~135 @100 ms** | Older **Node** 4× NATS on **pets** equal-arm (`executor-cmp-chaos-clawql-ceiling-refine.json`) | Label build/runtime/workflow/date, or stop putting it next to Bun **434** |
| **434 @500 ms**  | Single Bun HTTP multiplex                                                                      | Keep — Topology A                                                         |
| **596 @500 ms**  | **This** Bun 4× NATS on CF known-op                                                            | Prefer for the scale-out video beat                                       |

Putting **434** then **135** in one video implied scale-out makes ClawQL worse. On the current build, scale-out **improves** capacity; 8× only loses when the host is oversubscribed.

## Reproduce

```bash
npm run build
SCALEOUT_WORKERS=1,2,4,8 THRESHOLDS=100,250,500 SCALEOUT_STEP_MS=10000 \
  node scripts/benchmarks/clawql-nats-scaleout-curves.mjs
```
