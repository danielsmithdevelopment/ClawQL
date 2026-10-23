# ADR 0016: Rust data-plane spike (execute hot path + Verus trial)

- Status: **Rejected**
- Date: 2026-10-22
- Decided: 2026-10-23
- Related: [ADR 0014 formal methods](./0014-formal-methods-tla-lean.md) · [ADR 0015 program mode](./0015-program-mode-alongside-search-execute.md) · [ADR 0011 isolation](./0011-isolation-agent-substrate-sandbox-celld.md) · [ADR 0013 gdp-ts](./0013-gdp-ts-compile-time-auth-proofs.md) · [correctness by construction](../design/correctness-by-construction.md) · [`clawql-celld`](../streams/clawql-celld.md) · [measured defaults](../benchmarks/cloudflare-multiturn/measured-defaults.md) · [`formal/lean/`](../../formal/lean/)

## Context

This ADR proposed a thin Rust Streamable-HTTP execute plane (`clawql-dataplane`) plus a Verus trial on the approval-policy kernel, to chase memory/tail vs Bun/`--smol` and to prove production policy code.

ClawQL’s lasting formal stack remains **TLA+** (protocols), **Lean** (policy oracles + differential vs TypeScript), and **gdp-ts** (compile-time capability flow). See [ADR 0014](./0014-formal-methods-tla-lean.md).

## Decision question (one)

**Does moving the known-operation `execute` hot path to Rust close memory and tail gaps enough to justify building it properly, and can its critical pure pieces be proved correct with Verus (PDD Kit trial)?**

## Decision (spike outcome) — 2026-10-23

**Rejected.** ClawQL stays a **TypeScript + Effect TS v4** codebase with **Bun** as the default host runtime, **celld** for durable isolate/Streams workloads, and **Node** only for compatibility where required. **No Rust** in the product tree (no `crates/`, no Verus kernels, no dual-process dataplane).

### Evidence that drove no-go

| Evidence | Result |
| --- | --- |
| Component plane (direct MCP → Rust) | Governed CF known-op ~**15.8 MB** vs Bun ~**128 MB** — looks like a large density win **if** you ignore the Bun host |
| Product path (Bun → Rust forward, e2e) | Summed Anonymous RSS ~**124.8 MB** vs Bun-only ~**124.4 MB** — **tied**; dataplane-only RSS is not a product cite |
| Latency (e2e) | Forward hop costs session p50 (~**21 ms** dual vs ~**13 ms** Bun-only) and worsens call p999 |
| Peers | MCPJungle / agentgateway still ~**99–102 MB** — dual-process does not take memory leadership |
| Ops | Two processes, catalog/version skew, claim complexity — not justified by e2e numbers |

Spike branches measured the stack; they are **not** to be merged. Production remains single-process Bun (or celld for the isolate path).

### What we keep

1. **Bun `--smol`** as default host MCP (product ladder: celld isolate → Bun host → Node minority).
2. **celld** for Streams / ProgramCellDO durability ([ADR 0011](./0011-isolation-agent-substrate-sandbox-celld.md), [`clawql-celld`](../streams/clawql-celld.md)).
3. **Lean + TLA+ + gdp-ts** as the formal story ([ADR 0014](./0014-formal-methods-tla-lean.md)). No Verus / Kani track.
4. Memory and latency work continues **inside** TypeScript/Bun (lean listen, catalog, HTTP path) — not via a second language.

### What we discard

- `crates/clawql-dataplane` and any `crates/` Rust workspace
- `formal/verus/`
- Dual-process forward (`CLAWQL_DATAPLANE_*`), Helm dataplane stack, dataplane Docker image
- Planned **clawql-cellrt** Rust runtime — durability stays on **celld**; see [`clawql-cellrt.md`](../streams/clawql-cellrt.md) (withdrawn)

## Consequences

- Do **not** merge open dataplane / Verus / density-baseline Rust PRs into `main`.
- Do **not** cite dataplane-only RSS on clawql.com/benchmarks.
- Copy: ClawQL is TypeScript/Effect/Bun/celld — not a Rust gateway project.
- Future memory wins must show up on **single-process** (or honest multi-process **sum**) boards against peers.

## Out of scope (historical)

The spike never authorized replacing Bun as default Helm host, rewriting program mode in Rust, or shipping PDD Kit as a customer product. Those remain out of scope under Rejected as well.
