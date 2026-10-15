# Measured product defaults (filter workflow)

**Decision (2026-10-15):** ship what the Cloudflare zone-audit board and dual-model
gate actually proved. Program mode stays **alongside** `search` / `execute`, not
the core tool — until evidence says otherwise (below).

Related: [ADR 0015](../../adr/0015-program-mode-alongside-search-execute.md) ·
[`SPEC.md`](./SPEC.md) · [`lazy-plugin-costs.md`](../gateway-multi-comparison/lazy-plugin-costs.md)

## Two different questions (known-op ≠ program)

| Question | Answer when clear | Answer when not |
| --- | --- | --- |
| **Which operation?** | Known-op: call `execute` by `operationId` | Discovery: `search` (later: routed execute / Decide) — **not** a program |
| **How many ops per round trip?** | One → plain `execute` (+ optional `where`) | Several (fan-out, joins, pipelined reads) → `execute_program` |

| | One operation | Several operations |
| --- | --- | --- |
| **Operation known** | Known-op `execute` + `where` (**board winner**) | Program of known operations |
| **Operation unknown** | Search, then `execute` | Search, then a program |

A program does not supply knowledge of which tool to call. When the action is
unclear, what is missing is **discovery**, not a plan runner.

## What ships as the default path now

| Lever | Status | Evidence |
| --- | --- | --- |
| **SQLite catalog, OOP build** (`CLAWQL_CATALOG_SQLITE` on, `BUILD=oop`) | **Default on** | Spec-size RSS independent of OAS parse; board homes show `oop-build` → `LOAD=db` |
| **Lazy horizontal plugins** (require-on-flag; k8s dynamic import) | **Shipped** | Ready maps free of k8s/xenova/stripe when tiers off; first k8s import ~363 ms; fail-closed |
| **Server-side `where`** + examples in tool schema + fix-named `where_invalid` | **Default product** | Scripted known-op **1743** weighted; dual-model gate win vs Executor |
| **Observation budget** (`totalCount` in truncated list notes; `full:true` opt-out) | **Default on** (~8k chars) | Stops blind models from eating ~60k DNS dumps |
| **Bun + memory flags, ≥2 CPUs** | **Deploy recommendation** | Gateway runtime notes; Helm CPU limit ≥2 |
| **Compact search** (`CLAWQL_SEARCH_COMPACT`) | **Labeled arm only** until routing eval clears it | Cuts first-session discovery; not product default yet |
| **Known-op reuse** (skills / memory → steady-state execute-by-id) | **Product intent** | Cheapest arm on this workflow |

**Flag:** `CLAWQL_ENABLE_PROGRAMS` stays **off** by default. When on, programs sit
beside `execute`; agents choose them for multi-call work.

## Why program mode is not the core *yet*

On this filter workflow (scripted board):

| Arm | Weighted mean | Code mean |
| --- | ---: | ---: |
| `clawql_known_op` | **1743** | **191** (`where` args) |
| `clawql_program` | **5097** | **811** (plan JSON) |

Making today’s plan format the only path would make the common one-op case
~4× more expensive in code tokens (811 vs 191). Fan-out/join strength is still
unmeasured. The real-model headline gate was known-op vs Executor, not programs.
v0 is a declarative plan runner — not yet code in a celld isolate.

## Path to a single core tool (evidence-gated)

Instinct: a **one-step program should be just an `execute`**. If the program
format scales down so a one-step plan costs about the same as known-op args
(operation + arguments + `where`, no plan boilerplate), then program mode can
become the single surface: simple calls stay as cheap as today’s winner; complex
ones stay in the same tool.

**Promotion sequence:**

1. **Shrink one-step plans** toward `execute` size (target: code tokens ≈ known-op’s ~191 on this workflow).
2. **Rerun the Cloudflare 3×10k board** and the **pre-registered dual-model gate** — program must **match** known-op on the filter workflow.
3. **Build the fan-out / join board** — show where multi-step programs pull ahead (model turns + tokens).
4. Only then make program mode the core tool, with the same evidence standard that cleared known-op.
5. Keep ADR 0015 celld / isolation honesty gates before any “survives a crash” claim.

Until (1)–(2) hold, keep `execute` as the measured default for one-op work and
programs as the opt-in multi-op path.

## Memory line (same-run; do not mix)

Smoke N=5 tree smaps after OOP+lazy: ClawQL known-op **~117 MB** anon vs
MCPJungle Go+REST **~44 MB** (~**73 MB** gap) vs agentgateway **~68 MB** (~**49 MB** gap).
3×10k flatness remasure in flight — update comparison/video numbers from that
series, not from mixed-run MJ ~86 MB.
