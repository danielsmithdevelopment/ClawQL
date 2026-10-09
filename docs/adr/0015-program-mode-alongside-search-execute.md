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

| Advantage                             | How programs keep it                                                                                                                                                                                                                                                                               |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Every action visible, policy per call | Every tool call inside a program runs the same gateway path as `execute` (gate, risk, redaction, budgets, audit), linked to a program id. Sessions show program source plus each call.                                                                                                             |
| Trivial resume, at most once          | Programs do not write directly. They read and compute, then return **proposed operations**. ClawQL runs each proposal afterward as a normal `execute`, so mandates, Review, and `resume` work as today.                                                                                            |
| No interpreter as ambient authority   | Interpreter runs inside a **celld** cell ([ADR 0011](./0011-isolation-agent-substrate-sandbox-celld.md)) with memory/CPU caps; ClawQL sets default timeouts, call limits, and output limits (the upstream package leaves these unset). Vendor and pin the MIT package; add it to the fuzzing plan. |
| Works with any model and client       | Programs are optional (flag / key group). Small models keep `search` + `execute` only.                                                                                                                                                                                                             |
| Cheap failures                        | Diagnostics carry error types, source locations, and fix hints; results list each call’s outcome so an agent can fall back to single executes.                                                                                                                                                     |

### Wire their package into the catalog

1. Each ClawQL operation becomes one of their tools, described by existing JSON Schema; `run` calls the gateway execute path.
2. Replace their built-in search with ClawQL’s (risk-aware).
3. **Vendor** the package (MIT, private to their workspace today; Effect 4 like us) rather than depending on an unpublished workspace path.

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
| Scope                | A placeholder may only point to an **earlier proposal in the same set**.                                                                                                                          |
| Shape                | Resolve to a **single value** (e.g. an id string), not a whole object.                                                                                                                            |
| Path limits          | Cap reference path **depth** and **size** (exact caps in implementation; fail closed when exceeded).                                                                                              |
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
4. **MCP OAuth** — strip misleading Google device endpoint from AS metadata (now); then §1 discovery/audience; §2 per-person grants as keys; §3 CIMD + trusted-client list; §4 device flow. Post the `curl` follow-up in the discovery thread when §1 lands.
5. **Plain proxy mode** — scoped by key group, for harnesses that bring their own code mode.
6. **Program mode** — each step behind its gate: ADR 0015 → read-only programs in celld (benchmark must justify promotion) → proposed writes with refs → batch approval (TLA+) → IFC rule (Lean) → “never more” differential.
7. **Then mobile** — governed company-inbox demo as the answer to Executor apps when ready.

### Rollout (implementation detail under step 6)

1. Catalog improvements + fair suite (steps 1–2 above).
2. Session IFC on execute (step 3); Lean theorems + differential.
3. Read-only programs in celld behind a flag; benchmark multi-step **fan-out** and **cross-source joins** (not filter-only).
4. Proposed writes with proposal refs, combined-label IFC, then batch Merkle approve (TLA+ green first).
5. Tighten “never more” toward equality where honest once session labeling lands.
6. Journaled replay deferred until a benchmark shows proposal refs are insufficient.
7. Rerun Executor comparison against Executor v2 once its code mode ships; replace simulated program-filter with live.

## Non-goals

- Replacing `search` / `execute` with programs.
- In-program durable writes or ambient authority outside the gateway path.
- Cross-system transactions or atomic multi-leaf batches.
- A single mandate digest covering an entire batch.
- Claiming information-flow protection across client-side session boundaries.
- Depending on unpublished OpenCode workspace packages (vendor instead).
- Journaled multi-write replay in v1 (proposal refs first).

## Consequences

- New optional MCP tool (name TBD, e.g. `execute_program`) gated by flag / key group; Core tools unchanged.
- Mandate lifecycle and Review UX grow batch-root and partial-batch surfaces; mobile and console Review cards must show leaf states.
- `MandateArgsMatch` and pending store must support post-resolution digests and inclusion under a signed root.
- celld resource caps and fuzz targets expand to the vendored interpreter.
- Lean package gains an IFC module; CI fails on `sorry` / `admit` as in ADR 0014.
- Security and product copy: programs are a round-trip optimization under the same policy; session labeling is within-session only.

## Security-page claim (earned wording)

Only after TLA+ batch model green, Lean IFC theorems + differential green, and the “never more” suite green:

> Agents may run confined programs that cut round trips; every call still goes through the same gate, and batch approvals still bind each write to its exact arguments. Information-flow labels accumulate within a session and are checked in Lean against production.
