# Measured product defaults (filter workflow)

**Decision (2026-10-15):** ship what the Cloudflare zone-audit board and dual-model
gate actually proved. Program mode stays **alongside** `search` / `execute`, not
the core tool — until evidence says otherwise (below).

Related: [ADR 0015](../../adr/0015-program-mode-alongside-search-execute.md) ·
[`SPEC.md`](./SPEC.md) · [`lazy-plugin-costs.md`](../gateway-multi-comparison/lazy-plugin-costs.md) ·
[`memory-plateau.md`](./memory-plateau.md)

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
| **Bun + `--smol`, ≥2 CPUs** | **Preferred deploy runtime** | Plateau ~**130 MB** anon; faster than uncapped Node at p50/p99/p999 — see heap table below |
| **Node `--max-old-space-size=256`** | **Lean Node default** | Caps plateau ~**132 MB**; costs ~**3.5 ms** at p99 vs uncapped |
| **Compact search** (`CLAWQL_SEARCH_COMPACT`) | **Labeled arm only** until routing eval clears it | Cuts first-session discovery; not product default yet |
| **Known-op reuse** (skills / memory → steady-state execute-by-id) | **Product intent** | Cheapest arm on this workflow |

**Flag:** `CLAWQL_ENABLE_PROGRAMS` stays **off** by default. When on, programs sit
beside `execute`; agents choose them for multi-call work.

## Heap limits by feature profile

Do **not** run memory ingest (or other heavy in-process features) on the lean 256 MB
Node setting. Pick the row that matches what the pod actually enables:

| Feature profile | What is on | Node `NODE_OPTIONS` / Helm `nodeOptions` | Bun | Notes |
| --- | --- | --- | --- | --- |
| **Lean listen** (search/execute, SQLite OOP, no vault memory, no documents, pack none) | Core MCP only | **`--max-old-space-size=256`** (Helm / kustomize base default) | **`--smol`** | A/B plateau ~**132 MB** (Node) / ~**130 MB** (Bun). Stress: no OOM on `full:true`, program fan-out. HTTP multiplex SLO (p99≤100 ms): Node sustained **16**, Bun **32** — not the equal-arm chaos board. |
| **Memory-enabled** (`enableMemory` / vault ingest, embeddings rebuild) | + `memory_ingest` / recall | **`--max-old-space-size=384`** | `--smol` (raise host RAM if needed) | Long ingest (~305 KB doc) hit **~255–261 MB** anon under a 256 cap — survived but no headroom. |
| **Docker Desktop / all-providers demo** | memory + documents + large catalog | **768** (`values-docker-desktop.yaml`) | — | Catalog startup OOMs at 512. |
| **Heavy prod overlay** (kustomize `overlays/prod`) | site-specific | **3072** (existing overlay; leave unless remeasured) | — | Not the lean product claim. |

Helm lean default: `manifests/charts/clawql-mcp/values.yaml` →
`nodeOptions: "--max-old-space-size=256"`. Board harness:
`CLAWQL_NODE_MAX_OLD_SPACE_MB` defaults to **256** (`=0` uncapped).

### Heap A/B (N=4000 known-op) — interim until capped publish board

| Arm | Anon plateau | p50 / p99 / p999 ms | vs uncapped Node |
| --- | ---: | ---: | --- |
| Node uncapped | **296** | 2.9 / 9.8 / 17.3 | baseline |
| Node `--max-old-space-size=256` | **132** | 3.3 / **13.4** / 21.1 | −164 MB; **+3.5 ms p99**; +GC pauses |
| Bun `--smol` | **130** | **2.1 / 8.9 / 15.4** | −166 MB; **faster at every percentile** |

Same-run peers on the uncapped slim board: MCPJungle ~**88**, agentgateway ~**98**
anon. Capped/Bun gap vs those peers is about **35–45 MB** (132−88 / 130−98) — not “~30.”
**Prefer quoting plateau + peer gaps from the next publish board** (Node 256 default +
Bun arm), where memory series are same-run.

### Concurrency (do not over-claim)

Earlier gateway-multi single-instance chaos (p99 ≤ 100 ms): ClawQL **63/64**, MCPJungle
**204/205**, agentgateway **62/63** (stdio equal-arm + refine). Heap-cap stress first
claimed “128” without that SLO; with p99 ≤ 100 ms it sustains Node **16** / Bun **32**
(HTTP multiplex only). Re-measure equal-arm chaos on the next publish board before any
concurrency headline.

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

## Post lines

**Preferred (Bun primary):**

> On Bun, ClawQL plateaus near **130 MB** under sustained load, within about **40 MB**
> of the Go and Rust gateways, and runs faster than uncapped Node.

**Node lean default (state the tail cost):**

> On Node with `--max-old-space-size=256`, ClawQL plateaus near **132 MB** under
> sustained load, within about **35–45 MB** of the Go and Rust gateways, at a cost of
> about **3.5 ms** at p99 versus uncapped Node. Down from ~**630 MB** before OOP catalog
> + lazy listen.

Replace plateau/peer gaps with the next publish board’s same-run series when it lands
(Node 256 + Bun `--smol` arms).
