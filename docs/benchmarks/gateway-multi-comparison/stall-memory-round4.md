# Stall + Ready memory — round 4

Follow-up to [`stall-memory-round3.md`](./stall-memory-round3.md). Host-bound.

## Publish metric (correction)

**Keep client e2e as the published p999.** Peers are measured from the client; agents feel the full wait — including time after a fast handler if the response is delayed. Report server handler ms (`[clawql-http-slow]` / `x-clawql-server-t0`) as a **diagnostic column only**, never as a replacement for board p999.

## After-handler hypothesis: SSE hold-open — falsified on this path

Bench already sets `CLAWQL_STREAMABLE_HTTP_JSON_RESPONSE=1`. With `MT_STALL_DIAG=1`, the client logs **ttfb_ms** (headers) vs **complete_ms** (body drained):

| Observation | n=1500 Node (`ttfb-1.5k`) |
| --- | --- |
| `content_type` | **`application/json`** (not `text/event-stream`) |
| `hold_ms` (complete − ttfb) | **≈ 0** on every slow (≥20 ms) sample |
| Conclusion | Stalls are **before first byte**, not an open SSE stream |

Artifacts: `gateway-multi-multiturn-clawql-http-ttfb-1.5k.json`, `/opt/cursor/artifacts/ttfb-1.5k.stderr.log`.

## Two real stall classes (still client-visible)

| Class | Example (client / server / queue) | Meaning |
| --- | --- | --- |
| **In-handler** | 408.7 / **406** / queue≈2 — `tool=execute` | Time inside ClawQL POST handling |
| **In-handler** | 324.1 / **322.5** / queue≈1 — `tool=execute` | Same |
| **Pre-handler queue** | 132.6 / **5.1** / queue≈**127** | Request waits before Express handler (`server_t0` late) — event loop not polling |

So “after-handler” from round 3 was partly **pre-handler event-loop delay** (queue before `server_t0`), not response-stream hold. Publish p999 correctly includes both classes.

## Native tooling (GDB / Valgrind equivalents)

Yes — those tools apply to `node`/`bun` as native processes. What we ran here:

| Tool | Role | This run |
| --- | --- | --- |
| **`strace -f -tt -T`** | Timestamped syscalls + durations | `MT_STRACE_LOG=…` on HTTP child; summary via `summarize-strace-stalls.mjs` |
| **gdb / lldb** | Attach + `thread apply all bt` mid-stall | gdb .deb present but shared-lib deps missing in this image — use when deps available |
| **Off-CPU / eBPF** | Why threads sleep | Not installed here; next on a fuller host (`offcputime` / bpftrace) |
| **Heap snapshots / `--heap-prof`** | Valgrind-like for JS heaps | Prefer over Valgrind on JIT runtimes |

**strace finding (n=1200 under trace):** every syscall ≥20 ms was **`futex` resumed** (worker idle waits). **No** long `write`/`send*`/`epoll_wait`. That fits **main-thread userspace time** (JS/runtime) during stalls — invisible as a long syscall — plus workers parked on futex. Next: Node `--cpu-prof` / clinic Bubbleprof on an in-handler execute stall, and gdb backtraces when libs are available.

Enable: `MT_STALL_DIAG=1 MT_STRACE_LOG=/tmp/stall.strace`.

## Memory — canonical Ready

| Source | Lean listen | Fat listen | Notes |
| --- | ---: | ---: | --- |
| **Canonical** [`catalog-listen-rss.json`](./catalog-listen-rss.json) | **~233 MB** | **~280 MB** | Same probe; **+47 MB** fat delta |
| Deprecated mix-in | ~155 MB | — | `bun-ready-memory-probe` — different settle/path; **do not mix** |

Target &lt;200 MB under load requires cutting **lean Ready (~233 MB)** first; catalog laziness alone cannot get there.

## Knobs

| Flag | Role |
| --- | --- |
| `MT_STALL_DIAG=1` | Client slow + TTFB/complete + GC; server timing on child |
| `MT_STRACE_LOG=path` | Wrap Node HTTP child with `strace -f -tt -T` |
| `[mt-client-slow] … ttfb_ms=… hold_ms=… content_type=…` | First-byte vs body-complete |
| `[clawql-http-slow]` | Server handler duration (diagnostic column) |
