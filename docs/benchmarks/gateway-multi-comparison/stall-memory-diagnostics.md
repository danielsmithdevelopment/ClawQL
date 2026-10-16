# Stall + memory diagnostics (Bun HTTP)

Host-bound follow-up to equal search/execute max (~567 / 566 ms) on the first-session split board.

## Stalls — shared process block, not request work

| Probe | Result |
| --- | --- |
| Search vs execute max | **567 / 566 ms** — equal ceiling on different RPCs ⇒ event-loop block, not call body |
| Interleaved wall-clock ([`interleaved-stall-probe.json`](./interleaved-stall-probe.json)) | ClawQL + MCPJungle round-robin, 1500×12 — **no ~500 ms class stalls** (only flow-1 warmup; both arms overlapped) |
| Solo 4k + host-lag ([`gateway-multi-multiturn-clawql-solo-stalls-4k.json`](./gateway-multi-multiturn-clawql-solo-stalls-4k.json), [`host-lag-sidecar-summary.json`](./host-lag-sidecar-summary.json)) | ClawQL slow flows up to **~362 ms**; sidecar **0 slips** ⇒ **in-process**, not host steal |
| Stall spacing (solo top-11) | Gaps **~6–15 s**, weak cluster near **12 s** — not a crisp timer fingerprint yet |

**Verdict:** rare ClawQL event-loop stalls. Host/load-generator ruled out for the solo board. Timer hunting (trace export, audit flush, metrics) still open if a longer concurrent ClawQL+peer board reproduces the 500 ms class.

Probes: `scripts/benchmarks/interleaved-stall-probe.mjs`.

## Memory — anonymous data at Ready; DuckDB was eager

| Probe | Result |
| --- | --- |
| Bun ladder ([`bun-rss-ladder.md`](./bun-rss-ladder.md)) | empty **13** → `clawql-api` **88** → `import(server-http)` **165** → listen+warm was **~310** before this pass |
| smaps at Ready ([`bun-ready-memory.json`](./bun-ready-memory.json)) | RSS **~155 MB** after lazy `clawql-data`: **anon ~116 MB** / file-backed **~38 MB** (mostly `bun` binary). DuckDB mappings **absent** |
| Heap snapshot | Bun format exposes `nodeClassNames` only — **no retained-size ranking** usable here; chase anon mappings + lazy init instead |
| Multiturn after lazy DuckDB ([`gateway-multi-multiturn-clawql-http-bun-rss-post-duckdb-lazy.json`](./gateway-multi-multiturn-clawql-http-bun-rss-post-duckdb-lazy.json), n=80) | Ready **~292 MB**, under-load med **~283 MB** (was **~317 MB** on the targets board) |

**Verdict:** post-import budget is **anonymous data structures**, not mapped optional packages. Lazy `clawql-data` (DuckDB) in `compose-horizontal-plugin-layers-static.ts` cuts Ready probe RSS and ~30 MB under load; still above the **&lt;200 MB** video target. Next: defer other eager Effect/caches on the HTTP Ready path (catalog validators, tracing buffers) — same lazy pattern.

Probe: `scripts/benchmarks/bun-ready-memory-probe.mjs`.
