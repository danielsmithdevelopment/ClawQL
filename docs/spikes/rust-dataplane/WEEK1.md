# Week-1 signal — Cloudflare known-op (fast path only)

**Label: `fast-path-only`.** Rust Phase A has **no governance**. This is not the go/no-go comparison.

## Setup

- Shared production SQLite catalog (60 curated Cloudflare ops)
- Shared CF replay mock (`MT_UPSTREAM_LATENCY=0`)
- Bun host: `--smol`, `CLAWQL_CATALOG_SQLITE_LOAD=db`, equal-arm instance spec
- Rust: `clawql-dataplane` release, same catalog + `CLAWQL_API_BASE_URL`
- Interleaved Bun→Rust each iteration; **3 reps × 200 iters × 11 known-op steps**
- Harness: `scripts/dataplane/week1-cf-known-op.sh`

## Results (local, 2026-10-22)

| Arm            | Errors | per-call p50 / p99 / **p999** (ms) | per-session p999 (ms) | Anon plateau (last-5 median) |
| -------------- | ------ | ---------------------------------- | --------------------- | ---------------------------- |
| Bun host       | 0      | 1.29 / 4.66 / **12.15**            | 272                   | **~296 MB**                  |
| Rust dataplane | 0      | 0.64 / 4.09 / **7.63**             | 34                    | **~15 MB**                   |

Raw: `/opt/cursor/artifacts/dataplane-week1/week1-summary.json` (agent run) — re-run the harness to regenerate.

## How to read this

- Same catalog file and same upstream mock — memory dimension is now comparable in shape.
- Bun still carries the full host surface (even lean); Rust is execute-only.
- **Go/no-go waits for Phase B** when both sides do governance + audit work.
- If the raw gap stays this large after governance, week 2 is justified; if it collapses, stop.
