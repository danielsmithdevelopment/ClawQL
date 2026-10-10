# ADR 0015: Program mode alongside search and execute

- Status: Proposed
- Date: 2026-10-09
- Related: [ADR 0011 celld / sandbox isolation](./0011-isolation-agent-substrate-sandbox-celld.md), [ADR 0013 gdp-ts](./0013-gdp-ts-compile-time-auth-proofs.md), [ADR 0014 formal methods](./0014-formal-methods-tla-lean.md), [`formal/tla/mandate/`](../../formal/tla/mandate/), [`docs/mcp/mcp-tools.md`](../mcp/mcp-tools.md)

## Context

OpenCode’s `@opencode-ai/codemode` (Effect 4 AST interpreter) lets a model write a short JavaScript program that sequences or parallelizes host-supplied tools in one round trip. ClawQL’s shipped “code mode” is different: **lazy catalog loading** via `search` plus **one operation per `execute`**. That design keeps per-call policy, trivial mandate resume, and a small attack surface — and it loses efficiency on multi-step work (fan-out, filter large lists, cross-source joins).

We want OpenCode’s round-trip benefits **without** giving up ClawQL’s advantages. Their README leaves durable pause/resume, replay, and exactly-once to the host; those remain ClawQL’s responsibility. Programs that write in-process would break today’s resume model (re-running a program after `mandate_required` can double-execute earlier writes).

### Honest reading of the Executor token comparison

The live compare at [`/mcp-ui/trace/compare/executor`](https://clawql.com/mcp-ui/trace/compare/executor/) shows ~**110×** combined input (ClawQL 1,301 vs Executor 143,581). Almost all of that is **Layer 2**: ~**158×** on the tool result (907 vs 143,466). ClawQL wins because `fields` projection returns only what is needed; Executor’s run puts the full REST list into the model’s context. Layer 1 already favors Executor’s live install (115 vs ClawQL 394) — the page says so.

**That Layer 2 gap is exactly what OpenCode-style code mode closes:** the model filters before returning, and generated instructions tell it to return only needed fields. Once Executor v2 runs on it, the same task should land near a thousand tokens on their side too; the remaining difference is tool-definition size, where their live number is lower. Expect that rebuttal — get ahead of it.

| What the result proves                                                                                                         | What it does not prove                                                            |
| ------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| Result shaping matters far more than tool-definition size.                                                                     | That ClawQL permanently “beats” code-mode executors by 110×.                      |
| ClawQL gets that saving on a **single structured call**, with no model-written code, no interpreter, and full per-call policy. | That programs are unnecessary — they still win on fan-out and cross-source joins. |

**Benchmark plan** (see also [`docs/benchmarks/executor-comparison/README.md`](../benchmarks/executor-comparison/README.md)):

1. Publish a run where Executor’s program filters to the same fields (fair comparison next to today’s dump).
2. Expand beyond one task: ten or more, including multi-step work; measure **outputs**, not just inputs. Single-call listing is ClawQL’s best case.
3. Rerun against Executor v2 once its code mode ships.

## Decision

Adopt **confined programs as an additional tool**, alongside unchanged `search` and `execute`, under one governing rule:

> **A program may never see or do anything the same agent could not do with individual `search` / `execute` calls.** Programs only change how many round trips it takes. The rule is testable.

### Keep each advantage

| Advantage                             | How programs keep it                                                                                                                                                                                                                                                                                                  |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Every action visible, policy per call | Every tool call inside a program runs the same gateway path as `execute` (gate, risk, redaction, budgets, audit), linked to a program id. Sessions show program source plus each call.                                                                                                                                |
| Trivial resume, at most once          | Programs do not write directly. They read and compute, then return **proposed operations**. ClawQL runs each proposal afterward as a normal `execute`, so mandates, Review, and `resume` work as today.                                                                                                               |
| No interpreter as ambient authority   | Programs run as ordinary JS in a **celld** V8 isolate ([ADR 0011](./0011-isolation-agent-substrate-sandbox-celld.md), [`clawql-celld`](../streams/clawql-celld.md)) with memory caps, tools-only egress, timeouts/call/output limits, and (when earned) a durable SQLite journal. Not an in-process host interpreter. |
| Works with any model and client       | Programs are optional (flag / key group). Small models keep `search` + `execute` only.                                                                                                                                                                                                                                |
| Cheap failures                        | Diagnostics carry error types, source locations, and fix hints; results list each call’s outcome so an agent can fall back to single executes.                                                                                                                                                                        |

### Tool bindings (catalog → cell)

1. Each ClawQL operation becomes a host tool binding, described by existing JSON Schema; `run` calls the gateway execute path.
2. Search inside a program is ClawQL’s (risk-aware), not a second catalog loop.
3. **v1 path is celld-native durable code mode** (below), not an in-process OpenCode interpreter. If any OpenCode **code** is borrowed temporarily, keep its MIT copyright notice with it; prefer design borrowing over vendoring an unpublished workspace package.

### Proposed writes (no in-program side effects)

Programs may read freely (subject to the same redacted view the model would get) and return a set of **proposed writes**. The gateway runs each proposal through normal `execute` → gate → risk → mandate → Review → `resume`. No replay journal is required for v1.

### Dependent writes via proposal references

“Write A, then use A’s id for write B” does **not** require journaling or in-program writes.

- A program may return B with a placeholder such as `parentId: ref(A.result.id)`.
- The gateway topological-runs proposals: execute A, fill placeholders from A’s **actual** result, then create B’s request with **resolved** arguments.
- B’s mandate binds to the resolved digest; the approver sees the real id, not a placeholder.
- Anything more complex than a shallow DAG of proposals is **two programs**.

#### Reference constraints (review-critical)

| Constraint           | Rule                                                                                                                                                                                              |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scope                | A placeholder may only point to a read call of the same plan (`<call>.result…`) or an **earlier proposal in the same set** (`<proposal>.args…` / `<proposal>.result…`).                           |
| Shape                | Resolve to a **single value** (string, number, boolean, or null — e.g. an id), not a whole object or array.                                                                                       |
| Path limits          | Path depth ≤ 8 segments, `$ref` ≤ 256 characters, resolved string ≤ 4,096 characters, ≤ 32 refs per proposal; fail closed when exceeded.                                                          |
| Untrusted resolution | Resolved values often come from untrusted content (inbound email id, webhook payload). After resolution, arguments go through the **full** gate, risk, and redaction checks like any other write. |
| Digest binding       | `MandateArgsMatch` binds the digest of **post-resolution** args, never the template with placeholders.                                                                                            |

### Batch approval without weakening per-call digests

A program that proposes five changes must not become one mandate over the batch (that breaks per-call digest binding).

- Build a **hash tree** over the N digests.
- One security-key touch signs the **root**.
- Each execution proves its own digest is **included** under the signed root, then consumes at most once — same at-most-once invariant as today.
- Review shows **one card** (“This program proposes N changes”) with **per-item decline**.
- Extend [`formal/tla/mandate/MandateLifecycle.tla`](../../formal/tla/mandate/MandateLifecycle.tla) for batch park, root approve, inclusion-gated consume, and decline-one **before shipping**.

#### Batches are not atomic (non-goal)

There are **no transactions across outside systems**. If leaf 3 runs and leaf 4 later fails, **nothing rolls back**. Agents must not assume all-or-nothing.

The Review card for a partial batch must show, for every leaf:

| State   | Meaning                                                                                                |
| ------- | ------------------------------------------------------------------------------------------------------ |
| Ran     | Side effect completed (success terminal).                                                              |
| Failed  | Attempted; terminal failure / outcome_unknown handling as today.                                       |
| Dropped | Declined by the human, or skipped because a dependency was declined/failed and refs could not resolve. |
| Pending | Still awaiting approve/consume.                                                                        |

WORM / Sessions list the program id, the signed root, and each leaf’s digest and terminal state.

### Information flow

#### Program memory

Inside a program, data from one source sits in memory and can flow into another proposal. Without care, a program is a laundering channel (read an internal contract; propose a Slack post containing it).

**Rule:** label each program with the **union** of everything it read; evaluate every proposed write against those combined labels. Reads inside a program get the same redacted view the model would. Conservative, and what keeps the governing rule true.

#### Session-level labeling (execute path)

In step-by-step mode, the model’s context mixes data from every read the same way program memory does. If `execute` evaluates each write only against that one call’s inputs, the same laundering is possible through the model. **Accumulate read labels across the session** and evaluate writes against the union so both paths enforce the same rule.

#### What a session cannot cover (review-critical)

Session labeling is a **strong control within a session**, not a guarantee across sessions. A client can carry data from one session into the next in its own context; ClawQL cannot see that.

Two strengthenings:

1. **Labeled memory.** Data written to vault / memory keeps its labels; re-reading it later brings them back into the session’s accumulated set.
2. **Session definition.** Define exactly what a session is (default: **one MCP session per API key** / connection). Document the boundary in operator and security copy so “session labeling” is not overclaimed.

### Equivalence / differential test: “never more,” not identical

Until session labeling lands on execute, program combined-label checks are **stricter** than step-by-step execute. The differential test asserts:

> `permissions(program path) ⊆ permissions(step-by-step execute path)`

Not equality. After session labeling, the test may tighten toward equality. Random tasks must show the same reads, the same proposed writes (modulo refs resolution), and program decisions that are never more permissive.

Shipped as `packages/clawql-api/src/program/never-more.differential.test.ts`: 200 random tasks with session IFC on for programs and off for step-by-step, 200 with it on for both (equal decisions required wherever v0 limits don't apply), and laundering / sink fixtures in four plan shapes.

### Plain proxy mode (key-group scoped)

Harnesses that bring their own code mode need a thin policy-gated entry without ClawQL catalog UX. Spec: [`docs/specs/mcp/plain-proxy-mode-v0.1.md`](../specs/mcp/plain-proxy-mode-v0.1.md).

- Enable with `CLAWQL_ENABLE_PLAIN_PROXY=1` **or** put the key’s group in `CLAWQL_PLAIN_PROXY_KEY_GROUPS` (host sets `CLAWQL_API_KEY_GROUP`).
- Registers MCP tool `proxy_call` — same args and gateway path as `execute` (gate / risk / redaction / audit). Clients call known `operationId`s; skipping catalog COMPLETE UX is intentional (N/A for proxy).
- Core `search` / `execute` remain registered; proxy does not weaken policy.

### Catalog improvements with no programs (ship first)

These improve every client with zero new interpreter risk:

1. Search results: `COMPLETE` or `PARTIAL, N of M`, with counts per source.
2. Results as typed signatures with field descriptions.
3. Error messages that name the fix.
4. Truncation marker and flag on oversized execute results.
5. **Declarative filtering on `execute`** — optional `where` (small predicate or a JSON query language such as JMESPath), evaluated **server-side** after the provider response and composed with existing `fields` projection. Example: open PRs labeled `bug`, return `number` and `title` only. Caps on expression size/complexity; fail closed. Covers most of the **filtering** benefit of programs with no interpreter. Programs then only need to win on what neither projection nor filters can do: **fan-out** and **cross-source joins**.

### Formal gates

| Gate             | What it covers                                                                                                                                                                                                                                                                                       |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Benchmark**    | Promotes read-only programs when **fan-out** and **cross-source join** tasks show a clear win over `search`+`execute`+`fields`+`where`. Filtering-only tasks are not a promotion signal once declarative `where` ships. Fair Executor arms (program-filtered + v2) published alongside today’s dump. |
| **TLA+**         | Batch Merkle approve: root signature, inclusion proofs, per-digest at-most-once, decline-one, partial outcomes. Extends [ADR 0014](./0014-formal-methods-tla-lean.md) mandate model.                                                                                                                 |
| **Lean**         | Information-flow rule (small, pure). Two theorems: (1) labels only grow within a session; (2) a write is allowed only if the combined label may flow to its destination. Differential-test the production evaluator against the Lean model (same setup as approval policy).                          |
| **Differential** | Gates the “never more” claim (`program ⊆ execute`).                                                                                                                                                                                                                                                  |

### Execution order (proveable claims first)

Security and honesty first, then cheap wins every client gets, then public claims. Every public claim should point at a test, a model, or a benchmark (same discipline as the security page → ADR 0014).

1. **Fair benchmark before Executor v2** — program-filter arm (simulated until live), ≥10 tasks incl. multi-step, measure outputs. Artifact: `docs/benchmarks/executor-comparison/executor-cmp-fair-suite.json`.
2. **Wins that need no programs** — `where` on execute; search COMPLETE/PARTIAL; typed signatures; fix-named errors; truncation marker; `console_link` (or Core `clawql_console`); search over ClawQL’s own docs.
3. **Session-level information flow on execute** — closes existing laundering; programs depend on it, so it ships before them.
4. **MCP OAuth** — strip misleading Google device endpoint from AS metadata (done); §1 discovery/audience (shipped); §2 grant-as-key (`CLAWQL_MCP_OAUTH_GRANT_AS_KEY`); §3 CIMD trusted-client MVP (`mcp-cimd.ts`); §4 RFC 8628 device flow (`CLAWQL_MCP_OAUTH_DEVICE_FLOW=1` advertises ClawQL’s own endpoint). Remaining: CIMD fetch into live client registry; durable device-code store.
5. **Plain proxy mode** — scoped by key group, for harnesses that bring their own code mode.
6. **Program mode** — each step behind its gate: ADR 0015 → read-only programs in celld (benchmark must justify promotion) → proposed writes with refs → batch approval (TLA+) → IFC rule (Lean) → “never more” differential.
7. **Then mobile** — governed company-inbox demo as the answer to Executor apps when ready.

### Rollout (implementation detail under step 6)

1. Catalog improvements + fair suite (steps 1–2 above).
2. Session IFC on execute (step 3); Lean theorems + differential.
3. **v0** read-only plan runner (shipped); then **v1 durable code mode on celld** — benchmark multi-step **fan-out** and **cross-source joins** (not filter-only).
4. Proposed writes with proposal refs, combined-label IFC (shipped on the v0 runner), then batch Merkle approve (TLA+ green first).
5. Tighten “never more” toward equality where honest once session labeling lands.
6. Journaled replay **inside celld cells** (see durable code mode); proposal refs remain the gateway-side path for approvable writes until the crash demo holds.
7. Rerun Executor comparison against Executor v2 once its code mode ships; replace simulated program-filter with live.

### Program mode v0 (shipped MVP — honesty)

**v0 plan runner.** Not a JS interpreter. What ships now:

| Item      | Detail                                                                                                                                                                                                                                                                                                       |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Flag      | `CLAWQL_ENABLE_PROGRAMS=1` (default off); `CLAWQL_ENABLE_DURABLE_PROGRAMS=1` adds the durable journal and implies it                                                                                                                                                                                         |
| MCP tool  | `execute_program` — args `{ source, timeoutMs? }`; durable: `{ source?, programId?, timeoutMs? }` (resume by `programId`)                                                                                                                                                                                    |
| `source`  | JSON **plan** only: `{ "v": 1, "mode": "parallel"\|"sequential", "calls": [ { "tool": "execute"\|"search", … } ] }` (or a bare call array). Free-form JS is rejected with a fix hint.                                                                                                                        |
| Host path | Each call uses the same `search` / `execute` gateway path (gate, session IFC, audit) with a `programId` correlation on WORM metadata.                                                                                                                                                                        |
| Writes    | Never run inside a program: a call whose operation risk is not `allow` fails with `program_write_rejected`. List writes in `plan.proposals` instead.                                                                                                                                                         |
| Proposals | `{ "id", "operationId", "args", "fields"?, "where"? }` with `$ref` placeholders (constraints above). Returned resolved: `ready` (bound `argsHash`), `deferred`, or `rejected`.                                                                                                                               |
| Submit    | `submit_program_proposals { programId }` runs them in plan order through normal `execute`; leaves `ran` / `failed` / `dropped` / `pending`; call again after approving in Review.                                                                                                                            |
| IFC       | `CLAWQL_ENABLE_SESSION_IFC=1`: each in-program write is checked against every source the program reads, before the host call, whatever the order or fan-out (`program_ifc_blocked`); each proposal's destination against session ∪ program labels before it is returned (`ifc_blocked`) and again at submit. |
| Caps      | Max source length, max tool calls, timeout, max output bytes, max proposals (`CLAWQL_PROGRAM_MAX_*` overrides).                                                                                                                                                                                              |
| Return    | `{ ok, programId, result: { mode, results, proposals? }, calls: [{ operationId, ok, … }], diagnostics }`                                                                                                                                                                                                     |
| Durable   | Completed calls and `clock.startedAt` are journaled (fsync'd JSONL); resume by `programId` replays them without host calls. A non-read call in flight resumes as `outcome_unknown`; proposals are resolved again from the replayed results.                                                                  |
| Journal   | A celld-shaped file (JSONL) stand-in until the celld pin hosts the isolate; SIGKILLed-process tests resume without repeating a call — not yet the celld kill-node demo.                                                                                                                                      |

See [`docs/mcp/mcp-tools.md`](../mcp/mcp-tools.md) (`execute_program`, `submit_program_proposals`). Implementation: `packages/clawql-api/src/program/`.

**Proposed writes in v0 — limits.**

- Each `mandate` proposal parks its own mandate, bound to its post-resolution digest; batch approval over a signed root is not wired yet.
- Dependent chains continue through Review: approve, then submit again so the batch consumes the approval and fills `<proposal>.result` refs. `resume` returns its result only to its caller, so dependents of a leaf approved through `resume` are dropped (`result_unavailable`).
- Stored proposals are process-local and session-scoped, and live as long as a parked mandate. On another replica the client passes the echoed proposals, which then run like plain `execute` calls there; the program's labels do not travel with them, just as session labels (also process-local) do not.

### Durable code mode on celld (program mode step 2 — not a me-too)

OpenCode’s `@opencode-ai/codemode` is an elegant **in-process** AST interpreter; their README leaves durable pause/resume, replay, and exactly-once to the host. ClawQL’s advantage is not a second hand-written subset interpreter — it is **ordinary JavaScript in a celld V8 isolate**, with the program journal in the cell’s **SQLite** (LTX → operator bucket, **RPO=0**: celld does not ack a durable write until it reaches the bucket). That solves OpenCode non-goals by construction.

**Lead claim (only when earned):** “code mode that survives a crash” — not “a competitor to OpenCode.”

**Stand-in today:** with `CLAWQL_ENABLE_DURABLE_PROGRAMS=1` the v0 plan runner journals to a celld-shaped file (JSONL) stand-in with the same replay contract (Program mode v0 → Durable / Journal rows). `ProgramCellService` (`celld-program-cell.ts`) is the cell-shaped façade over that journal (run/resume); it is not a pinned celld V8 isolate or SQLite/LTX path, and the earned-claim sequence below still gates any crash claim.

| Advantage vs in-process interpreter | How celld supplies it                                                                                                                                            |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Programs survive crashes / parks    | Journal every completed tool call + non-deterministic value in cell SQLite; new cell replays and continues; approvals park without double-executing prior writes |
| Full language + hard isolation      | Workers/DO V8 isolate, not a hand-rolled subset; per-cell memory limit; tools are the only door (no `fetch`, no ambient globals)                                 |
| Governance built in                 | Proposed writes, IFC labels, mandates, WORM audit — ClawQL gateway path on every call; not “host owns policy later”                                              |

**Tenant isolation (hard caveat — from [`docs/streams/clawql-celld.md`](../streams/clawql-celld.md) alpha posture):** celld is **not safe for hostile multi-tenant** use. Model-written code is hostile input. Therefore:

1. **One tenant per celld node or fleet** — never mix tenants on a node (same posture as Streams: one app per fleet / separate buckets).
2. **Outer containment** — gVisor or Kata + locked-down egress around nodes ([ADR 0011](./0011-isolation-agent-substrate-sandbox-celld.md) / Streams AWS burst).
3. **Inside a cell:** no `fetch`, no ambient network — **tools only**.
4. **CPU watchdog** — terminate runaway isolates if the pinned celld build does not enforce CPU time; verify against the pinned version before claiming.

**Open-source vs keep (Ontologiql-shaped split):**

| Publish (runtime)                                             | Keep (ClawQL)                                  |
| ------------------------------------------------------------- | ---------------------------------------------- |
| Cells, tool bindings, journal, discovery, diagnostics, limits | Mandates, information flow, risk, audit / WORM |

OpenCode’s package is MIT but unpublished (private workspace). A maintained, published durable runtime would be first of its kind; ClawQL remains the flagship governed workload on celld (strengthens the Ryan / celld conversation).

**Attribution:** Borrowing designs is fine. If any OpenCode **code** lands in ClawQL, even temporarily, ship its MIT copyright notice with it — visibly, especially after public posts crediting Dax.

**Earned-claim sequence (do not publish the runtime until these hold):**

1. Build as program mode step 2 inside ClawQL on the **pinned** celld version.
2. Benchmark vs OpenCode’s interpreter: latency per tool call (isolate boundary cost), cold start, memory, first-attempt success on multi-step tasks.
3. **Crash demo:** kill a node mid-program in the three-arm load-test setup; show resume **without repeating a call**, plus audit entries. Prefer a short clip or Sessions/trace link as the public reply that turns “with the hopes of” into a result.
4. Extract and publish the runtime once those numbers hold.

### Public positioning (honest until proven)

Quote-tweet posture toward OpenCode is correct when it credits generously, names celld / Ryan, and hedges with “with the hopes of.” Close the loop in the same thread with the crash demo when it works. Outreach to Ryan should stay concrete (what ClawQL already runs on celld: sessions, event subscriptions, operator, burst-load design; what governance needs from the runtime: memory/CPU limits, tools-only door, audit hooks).

## Non-goals

- Replacing `search` / `execute` with programs.
- In-program durable writes or ambient authority outside the gateway path (until journal + proposed-write / mandate path is proven).
- Cross-system transactions or atomic multi-leaf batches.
- A single mandate digest covering an entire batch.
- Claiming information-flow protection across client-side session boundaries.
- Treating celld isolates as sufficient for **hostile multi-tenant** isolation (they are not, while alpha).
- Claiming “survives a crash” before the kill-node demo and audit trail exist.
- Publishing the runtime before benchmark + crash demo hold.
- Shipping OpenCode source without its MIT copyright notice.

## Consequences

- Optional MCP tools (`execute_program`, later celld-backed durable runner) gated by flag / key group; Core `search` / `execute` unchanged.
- Mandate lifecycle and Review UX grow batch-root and partial-batch surfaces; mobile and console Review cards must show leaf states.
- `MandateArgsMatch` and pending store must support post-resolution digests and inclusion under a signed root.
- Program journal lives in cell SQLite / LTX; compliance WORM remains host `clawql-audit` (platform durability ≠ compliance WORM — same split as Streams).
- celld fleets for programs: one tenant per fleet; outer gVisor/Kata; CPU watchdog verified on pin.
- Lean package gains an IFC module; CI fails on `sorry` / `admit` as in ADR 0014.
- Security and product copy: lead with crash survival when proven; until then programs are a round-trip optimization under the same policy; session labeling is within-session only.

## Security-page claim (earned wording)

Only after TLA+ batch model green, Lean IFC theorems + differential green, the “never more” suite green, **and** the celld kill-node resume demo green:

> Agents may run confined programs that cut round trips and survive restarts; every call still goes through the same gate, and batch approvals still bind each write to its exact arguments. Information-flow labels accumulate within a session and are checked in Lean against production.
