# clawql-cellrt — Withdrawn

**Status:** **Withdrawn** · 2026-10-23  
**Superseded by:** [`clawql-celld.md`](./clawql-celld.md) + [ADR 0011](../adr/0011-isolation-agent-substrate-sandbox-celld.md) · [ADR 0016](../adr/0016-rust-dataplane-spike.md) (**Rejected**)

## Decision

ClawQL will **not** build an owned Rust/Wasmtime cell runtime (`crates/clawql-cellrt`).

| Layer                                                 | Owner                                                                      |
| ----------------------------------------------------- | -------------------------------------------------------------------------- |
| Host MCP (search, execute, plugins, memory, OAuth, …) | **TypeScript + Effect TS v4** on **Bun** (default); Node for compatibility |
| Durable isolate / Streams / ProgramCellDO             | **celld** (self-hosted Durable Objects–compatible runtime)                 |
| Formal methods                                        | **TLA+** + **Lean** + **gdp-ts** — not Verus/Rust                          |

ADR 0016 rejected a Rust execute data plane after dual-process e2e boards showed **no product memory win** (summed Bun+dataplane ≈ Bun-only) and a latency cost. The same product stance applies here: do not introduce a Rust toolchain or `crates/` tree into ClawQL.

## What to use instead

- Streams / durable programs: [`clawql-celld.md`](./clawql-celld.md), Streams getting started on docs.clawql.com
- Isolation boundaries: [ADR 0011](../adr/0011-isolation-agent-substrate-sandbox-celld.md) (celld for cells; Agent Substrate for `sandbox_exec`)
- Host runtime ladder: celld (isolate) → Bun (default host) → Node (minority)

## Historical note

An earlier draft of this page specified a Rust + Wasmtime `clawql-cellrt` binary (~50–80 MB target) in-repo under `crates/clawql-cellrt/`. That plan is cancelled. Do not scaffold the crate; do not cite cellrt as a shipping path.
