# ADR 0016: Rust data-plane spike (execute hot path + Verus trial)

- Status: Proposed
- Date: 2026-10-22
- Related: [ADR 0014 formal methods](./0014-formal-methods-tla-lean.md) · [ADR 0015 program mode](./0015-program-mode-alongside-search-execute.md) · [ADR 0011 isolation](./0011-isolation-agent-substrate-sandbox-celld.md) · [ADR 0013 gdp-ts](./0013-gdp-ts-compile-time-auth-proofs.md) · [correctness by construction](../design/correctness-by-construction.md) · [`clawql-cellrt`](../streams/clawql-cellrt.md) · [dominance roadmap](../benchmarks/dominance-roadmap.md) · [measured defaults](../benchmarks/cloudflare-multiturn/measured-defaults.md) · [`formal/lean/`](../../formal/lean/)

## Context

ClawQL’s formal stack today proves **models**, not the production TypeScript that runs:

| Layer      | What it proves                                | Gap                                                           |
| ---------- | --------------------------------------------- | ------------------------------------------------------------- |
| **TLA+**   | Mandate / batch / event protocols             | Design of races and crash boundaries — not the gateway binary |
| **Lean**   | Approval policy + IFC oracles                 | Executable model; production matches via differential sample  |
| **gdp-ts** | Compile-time capability flow on TS call sites | Types, not runtime semantics                                  |

Microsoft Research’s **Proof Driven Development Kit (PDD Kit)** + **Verus** (GitHub Universe, Oct 2026) aims at a different claim: prove that **the Rust code that runs** meets a formal spec for every input. Where proof is not possible, it falls back to tests and computer-use agents. That only applies if security-critical pieces are actually written in Rust.

Separately, Bun/`--smol` equal-arm lean plateaus near **~142 MB** anon on tip after the lazy-listen restore (Oct-15 side-branch cite was ~130 MB — not tip). See [measured defaults](../benchmarks/cloudflare-multiturn/measured-defaults.md) and [LEAN-BISECT](../spikes/rust-dataplane/LEAN-BISECT.md). That floor is **separate** from the JSON `_streamMapping` climb ([memory-plateau](../benchmarks/cloudflare-multiturn/memory-plateau.md)). Week-2 density baseline (settled): tip Bun ~130 MB stable; publish CF 3×10k Bun plateau [124.4, 128.5] med 124.5 vs Rust ~15.6 MB (~8×); latency effectively equal (p50 gap ~0.5 ms; p999 tied — not “2× faster”). Do not compare Rust against the leaking climb. Tail latency and residual gateway overhead on the execute path remain open levers ([executor side-by-side](../benchmarks/executor-comparison/), [hot-path RSS map](../../Memory/execute-hotpath-rss-growth-sources-ranking.md) in vault). A Rust **data plane** for the known-operation execute path is the natural place to try both: memory/tail gains **and** Verus-backed policy kernels.

This is **not** [`clawql-cellrt`](../streams/clawql-cellrt.md) (owned Durable-Objects-style Rust + Wasmtime cell runtime). The spike is a thin Streamable-HTTP gateway in front of today’s TypeScript host. cellrt remains the Streams/cell substrate plan.

ADR 0014 deferred Verus/Kani to “later for celld’s Rust sandbox core.” This ADR promotes a **scoped Verus trial on the data-plane policy kernel** first — smaller surface, Lean properties already written.

## Decision question (one)

**Does moving the known-operation `execute` hot path to Rust close memory and tail gaps enough to justify building it properly, and can its critical pure pieces be proved correct with Verus (PDD Kit trial)?**

Evidence answers go/no-go. A finished product is out of scope.

## Decision (spike shape)

### In: one path, end to end

Known-operation `execute` over Streamable HTTP (JSON mode) — ClawQL’s fastest-growing path and the one every latency/RSS board exercises:

| Slice            | Spike behavior                                                                                                                                                          | Production anchors (today)                                                                                                                                                                                                                                                                                                                                        |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **MCP endpoint** | Streamable HTTP; `tools/call` for `execute` + minimal `tools/list`                                                                                                      | [`src/http/mcp-http-server.ts`](../../src/http/mcp-http-server.ts) — start from official Rust MCP SDK (`rmcp`)                                                                                                                                                                                                                                                    |
| **Catalog**      | Read-only from the existing SQLite catalog the TypeScript build already produces; no new format                                                                         | SQLite catalog / OOP catalog path used by host today                                                                                                                                                                                                                                                                                                              |
| **Governance**   | API-key or token verify → risk class → allow / park / deny → session IFC labels → single-use mandate consume (same conditional Postgres `UPDATE…WHERE` as TLA+ Consume) | [`execute-core.ts`](../../packages/clawql-api/src/execute/execute-core.ts), [`classify-operation-risk.ts`](../../packages/clawql-api/src/risk/classify-operation-risk.ts), [`session-ifc-enforce.ts`](../../packages/clawql-api/src/ifc/session-ifc-enforce.ts), [`pending-execution-store.ts`](../../packages/clawql-api/src/pending/pending-execution-store.ts) |
| **Upstream**     | Pooled HTTP client with keep-alive                                                                                                                                      | REST execute path in `clawql-api`                                                                                                                                                                                                                                                                                                                                 |
| **Results**      | Projection, `where` via a Rust JMESPath crate, result budget                                                                                                            | [`where-filter.ts`](../../packages/clawql-api/src/execute/where-filter.ts)                                                                                                                                                                                                                                                                                        |
| **Audit**        | Same hash-chained process-WORM format so existing verifiers work                                                                                                        | [`clawql-audit`](../../packages/clawql-audit/)                                                                                                                                                                                                                                                                                                                    |

### Out (stay TypeScript)

Console, catalog **building**, search/discovery, program mode / durable journal, decision sites, memory tools, OpenAPPA, OAuth server, celld isolate path, optional tools. The Rust process **forwards** non-execute traffic to the existing TypeScript server.

### Architecture

```
Client ──Streamable HTTP──▶ Rust data plane ──execute hot path──▶ upstream APIs
                              │
                              └── other MCP / tools ──forward──▶ TypeScript host (unchanged)
```

One process boundary. If the spike fails, delete the Rust process; Helm/Bun host stays.

### How correctness is established

1. **Differential tests vs TypeScript** — same requests through both paths must agree on results, park/deny/allow decisions, and audit records. Fuzz JMESPath/`where` specifically (highest semantic-drift risk between crates).
2. **Existing boards remasured through the Rust path** (not new category claims):
   - Governance / policy-depth — [`docs/benchmarks/governance-policy-depth/`](../benchmarks/governance-policy-depth/)
   - Multi-attack injection — [`docs/benchmarks/security-suite/multi-attack-injection/`](../benchmarks/security-suite/multi-attack-injection/)
   - Approval integrity — [`docs/benchmarks/security-suite/approval-integrity/`](../benchmarks/security-suite/approval-integrity/)
   - Gateway multi / Cloudflare multiturn latency+RSS arms — [`gateway-multi-comparison`](../benchmarks/gateway-multi-comparison/), [`cloudflare-multiturn`](../benchmarks/cloudflare-multiturn/)
3. **Verus proofs (PDD Kit trial) on three small pure components** — Lean properties become the starting specs:

| Component            | Properties (from Lean / production)                                                        | Sources                                                                                                                                                     |
| -------------------- | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Policy evaluator** | No self-approval; N-of-M needs N distinct people; deny destructive when configured         | [`formal/lean/ApprovalPolicy.lean`](../../formal/lean/ApprovalPolicy.lean), [`approval-policy.ts`](../../packages/clawql-api/src/policy/approval-policy.ts) |
| **Label merge**      | Labels only grow; overflow merge moves toward untrusted; write iff combined label may flow | [`formal/lean/InformationFlow.lean`](../../formal/lean/InformationFlow.lean), [`labels.ts`](../../packages/clawql-api/src/ifc/labels.ts)                    |
| **Approval digests** | Canonical args → same digest; any arg change → different digest (`argsHash`)               | [`args-hash.ts`](../../packages/clawql-api/src/pending/args-hash.ts)                                                                                        |

**Not AgentDojo.** There is no in-tree AgentDojo board; do not invent one for the spike ([agentready proposal](../proposals/agentready-act-safely.md) forbids claiming AgentDojo until published). Multi-attack + approval-integrity are the adversarial remasure set.

**What Verus will not cover (keep TLA+ / Lean / differential):**

- Distributed races, crashes, DB atomicity → TLA+ ([`formal/tla/mandate/`](../../formal/tla/mandate/))
- Spec mistakes → humans review specs (PDD Kit framing); Lean gives the head start
- Research maturity → prove **one** kernel before planning a factory around it

### What to measure (bars set before coding)

Baselines from Bun lean listen / peer boards ([measured defaults](../benchmarks/cloudflare-multiturn/measured-defaults.md)):

| Metric                  | Baseline (today)                                                                   | Spike go bar (proposed)                                                                                                  |
| ----------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| **Anon RSS under load** | Tip Bun lean ~**139–142 MB**; CF known-op board ~**129 MB** post-lazy; peers ~**99–103 MB** | ≤ **half of tip Bun after leak fix** **or** within peer band with clear headroom — pick one bar in Phase 0 and freeze it |
| **Latency**             | p50 / p99 / p999 on equal-arm REST execute                                         | Post-prune CF known-op: call p999 **dead heat** (~4.9 ms). Go bar shifts to **density** unless Rust also clears the separate HTTP 300–700 ms multiturn stalls ([HTTP-TAIL-POST-PRUNE](../spikes/rust-dataplane/HTTP-TAIL-POST-PRUNE.md)) |
| **Clients / instance**  | Bun median **84** @ p99 ≤ 100 ms (HTTP multiplex)                                  | Meet or beat Bun on the same workflow                                                                                    |
| **Correctness**         | —                                                                                  | **Zero** differential mismatches on the agreed suite                                                                     |

**Proposed go criterion (freeze in Phase 0):** memory ≤ half Bun **or** ≤ peer gateway band with ≥20 MB headroom; clearly better p999; zero differential diffs; Verus proves at least the policy evaluator (label merge + digests are stretch). Otherwise TypeScript/Bun stays, and the write-up records why cheaply.

## Phases (technical milestones, not a calendar)

| Phase                      | Deliverable                                                                                                                          | Exit                                                |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------- |
| **0 — Freeze**             | Bar spreadsheet, board list, crate layout under `crates/clawql-dataplane/`, Verus/PDD Kit toolchain pin, differential harness sketch | Written bars + harness stub merged                  |
| **A — Bare fast path**     | Endpoint + catalog read + upstream call + `where`/projection; **no** governance                                                      | Latency/RSS vs Bun; if no signal, stop              |
| **B — Governance + audit** | Risk → IFC → consume → WORM; differential suite green                                                                                | Diff = 0 on suite                                   |
| **C — Proof + boards**     | Verus on policy (± labels/digests); remasure governance + multi-attack + approval-integrity + one latency/RSS board (3 runs)         | Proofs or honest “could not prove X”; board numbers |
| **D — Decision**           | Spike report + **go/no-go** recorded in this ADR (status → Accepted/Rejected)                                                        | Single owner decision                               |

If go: plan for Rust to become the **only** policy-engine implementation (called from TypeScript via FFI/gRPC/WASM as needed). Dual implementations drifting is the long-term risk that kills the win.

## Consequences

- **Accepted go:** invest in productionizing the data plane; keep TLA+ for protocols; migrate Lean oracles → Verus specs as source of truth for the three kernels; retire dual TS evaluators over time.
- **Rejected / no-go:** delete `crates/clawql-dataplane/`; Bun/TS remains default; keep Lean+differential as the policy story; optional note that Verus was tried and what blocked it.
- **cellrt unchanged:** DO/cell substrate stays [`clawql-cellrt`](../streams/clawql-cellrt.md); this ADR does not authorize building cellrt.
- **Copy:** do not claim “mathematically proven policy” until Verus proofs land **and** the go decision is Accepted. Until then: “Lean oracle + differential” (ADR 0014 wording).

## Out of scope for the spike

- Replacing Bun as default Helm host
- Program mode / celld ProgramCellDO in Rust
- Full MCP tool surface
- Shipping PDD Kit / Chopin as a customer-facing product
- AgentDojo or any unpublished peer board
