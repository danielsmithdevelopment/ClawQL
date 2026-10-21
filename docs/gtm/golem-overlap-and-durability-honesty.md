# Golem overlap, interoperability, and durability claim honesty

**Status:** internal GTM + product honesty (not a published category board)  
**Audience:** anyone writing public copy, benchmarks, or outreach about durability / program mode  
**Related:** [ADR 0015](../adr/0015-program-mode-alongside-search-execute.md) · [dominance roadmap](../benchmarks/dominance-roadmap.md) · [mcp-tools § Durable programs](../mcp/mcp-tools.md#durable-programs) · [streams-celld evidence](../streams/streams-celld-evidence.md)  
**External:** [golem.cloud](https://golem.cloud/) · John De Goes durability pressure ([X](https://x.com/jdegoes/status/2112657693349744841))

---

## One-liner

**Golem keeps the agent durable. ClawQL governs what its tools may do.** Interoperate over MCP; do not compete as a durable execution engine.

---

## De Goes confirmation (Golem 1.6 — his words)

In a public reply on durability (Golem 1.6 / Pi tools on Golem), he stated the model plainly:

1. **Agent + installed tools on Golem** → exactly-once semantics for that execution surface.
2. **Databases through Golem interfaces** → exactly-once.
3. **Third-party side-effecting APIs** → interrupted POST is **at least once** on recovery; you get back to exactly-once **only if** the server honors idempotency keys (Golem adds them automatically; Stripe-class).

That is not a flaw — no system does better without the other side’s cooperation. It confirms the trade-off our board already measures.

| Choice                       | Favors                                 | Crash mid-POST without upstream keys                      |
| ---------------------------- | -------------------------------------- | --------------------------------------------------------- |
| **Golem**                    | Completing the work (retry)            | Possible **duplicate**                                    |
| **ClawQL (governed writes)** | Never repeating a consequential action | **At most once**; may land `outcome_unknown` for a person |

Wire transfers, emails, contract changes — anywhere a duplicate is worse than a pause — are ClawQL’s side of that trade-off.

---

## What Golem is (accurate for our positioning)

A runtime where agents are ordinary code in per-agent WebAssembly VMs with durability built in: resume mid-function after restarts, rescaling, long waits, and crashes. Outbound calls go through a host choke point that checks permissions and records them. Tool calls are worded as exactly-once **when the callee honors idempotency keys** Golem adds (Stripe-class); otherwise recovery of an interrupted third-party POST is at least once. Secrets can be opaque handles; revealing a value needs a grant. BSL → Apache 2.0 later (not OSI open source today).

ClawQL is **not** trying to be that runtime.

---

## Public claim inventory (say only this)

| Allowed claim                                                                              | Basis                                                                                                                                         | Forbidden paraphrase                                                                                   |
| ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| **Approved writes run at most once** across concurrent replicas / crash races              | TLA+ model + single-use mandate implementation; file-journal kill-mid-write board ([STATUS](../benchmarks/durability-proof/STATUS.md) Tier D) | “Durable execution,” “exactly-once delivery over HTTP,” “fault-tolerant agent runtime”                 |
| **Events are delivered at least once with stable IDs**; receivers that dedupe process once | Events formal model / launch caption honesty                                                                                                  | “Delivered exactly once”                                                                               |
| **Erasure jobs resume** after interruption                                                 | Product behavior                                                                                                                              | “Agents resume mid-function”                                                                           |
| **Program-mode crash recovery** (file-journal + isolate + fleet phased kill on R2)         | Lab + fleet evidence ([STATUS](../benchmarks/durability-proof/STATUS.md) Tier C); scoped claim with failover seconds + availability costs     | “Durable execution engine,” “exactly once,” or hiding the ~12s lease failover / stock self-fence rates |
| **Durable Object / celld / LTX** as Streams session substrate                              | Spec + Lab 5b                                                                                                                                 | Equating Cloudflare/celld DO session state with Golem-class durable execution                          |

**ClawQL is not a durable execution engine.** Prefer “journaled program resume (lab)” and “at-most-once approved side effects” over “durable agents.”

Env flag **`CLAWQL_ENABLE_DURABLE_PROGRAMS`** means _journaled program resume_, not Golem-style durable execution. Keep that distinction in every sentence that mentions the flag.

---

## Overlap (honest)

| Surface                         | Golem                                  | ClawQL today                                                                                   |
| ------------------------------- | -------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Crash-surviving agent code      | Shipped production mid-function resume | Program mode: lab + fleet phased kill (R2); no shared crash board vs Golem yet                 |
| Permissions agents can’t bypass | Host choke point + log                 | Gateway park/IFC + people-bound mandates                                                       |
| Secrets as handles              | Opaque handles + grant to reveal       | Capability / grant surfaces (narrower product story)                                           |
| Exactly-once tool side effects  | Idempotency keys + callee cooperation  | At-most-once **approved** writes; interrupted non-reads → `outcome_unknown`, never auto-resent |
| Hosted artifacts                | First-class                            | Adjacent to Executor-style apps direction — not ClawQL’s core wedge                            |

---

## Where ClawQL is different (and should stay ahead)

1. **Agents you already use** — Claude Code, Cursor, ChatGPT, any MCP client; OpenAPI → tools from specs. Golem asks you to run agents _inside_ its runtime.
2. **Approvals as a primitive** — requester can’t approve; person + security key; digests bind exact args. Golem approval is typically “await a webhook” left to each app.
3. **Content-level safety + token efficiency** — IFC / injection data-flow, `where`, known ops, decision sites.
4. **Tamper-evident audit** — WORM chain with customer-held roots, not only a per-agent recovery log.
5. **Open license** (vs BSL today).

---

## SDKs (do not chase Golem’s breadth)

Golem needs language SDKs because agents **run inside** Golem. ClawQL agents reach the product over **MCP** and OpenAI-compatible HTTP — any MCP client and official OpenAI SDKs already work. State that as an advantage.

Where SDKs help (typed clients from ClawQL’s own API, not agent-in-runtime):

- TypeScript and Python first, then Go
- Await approval / mandate status
- Verify audit chain
- Submit / resume program plans
- Typed catalog operations

Skip Scala / MoonBit-style breadth unless a customer asks.

---

## Product improvement: mandate-derived idempotency keys (planned)

When the upstream supports idempotency keys, ClawQL should attach a key derived from the mandate / execution id (spec sketch: `clawql-mandate:<executionId>` in [execute-pause-resume](../specs/risk/execute-pause-resume-v0.1.md)). Then an interrupted call can be **safely retried with the same key** and resolved automatically instead of becoming `outcome_unknown`.

| Upstream                   | Behavior after ClawQL ships keys                                                   |
| -------------------------- | ---------------------------------------------------------------------------------- |
| Honors keys (Stripe-class) | Exactly-once effect on retry — same class of outcome as Golem on that API          |
| No keys / ignores them     | Stay **at most once** (consume approval; refuse re-send); person resolves unknowns |

That cuts in-flight `outcome_unknown` on the phased board for idempotent mocks, without giving up the non-idempotent guarantee. **Do not claim this until implemented and measured.**

---

## Gaps to close (order)

1. **Durability, shipped** — Tier C fleet phased kill on R2 is measured (N=1000, 0 dups); preferred renew/lease tune still planned. Head-to-head Golem arm still open.
2. **Mandate-derived idempotency keys** — attach + safe retry when upstream honors keys; keep at-most-once elsewhere (above).
3. **Delegated permissions that narrow and cascade** — time-limited sub-agent slices; revoke parent → revoke children.
4. **Read-only result caching** — specs already mark reads; gateway cache until next write.
5. **Awaitable approvals in SDKs** — same strength as today, easier to code against.
6. **Live-adjustable quotas** — confirm per-key concurrency/rate without redeploy (beyond spend caps).
7. **Published per-unit numbers** — cold start, programs per node, memory per program cell (yardstick vs Golem’s published figures).

**Leave alone:** per-agent databases, hosting agent-built sites, live-updating running agent code — agent-runtime territory.

---

## Benchmark use of Golem (and Pi Durable)

Full board plan: [`docs/benchmarks/durability-proof/COMPARISON.md`](../benchmarks/durability-proof/COMPARISON.md).

- **celld** is ClawQL’s substrate (Tiers B/C), not a third rival.
- **Pi Durable** (harness) and **Golem** (execution runtime) are the peer arms.
- Score **duplicates** and **lost / `outcome_unknown`** under kill-mid-write; run idempotency-honoring **and** non-idempotent upstreams — the dual modes match his own conditions (keys vs no keys).
- Include **Pi Durable + ClawQL** and **Golem + ClawQL** combination arms: Golem keeps the agent/tools durable; ClawQL’s single-use approvals turn a Golem retry into a **refusal** on APIs without keys (closes the non-idempotent case in his model).
- Named public boards need maintainer invitation first. ClawQL-only Tier C numbers are ready for private outreach; named peer boards still wait on invite.

Do **not** put Golem on the MCP token/governance pets board as if it were Bifrost/Obot — wrong product shape.

---

## Collaboration pitch (reply shape)

Worth sending once numbers + harness are linked:

> Here’s how ClawQL closes the non-idempotent case in your model, measured — and we’d like you to check our setup.

Body in order: (1) his three conditions, acknowledged; (2) ClawQL chooses at-most-once for governed writes (opposite side of the trade-off); (3) Tier C claim + evidence + dual-mode board design; (4) invite him to configure the Golem arm; (5) optional: planned mandate-derived keys for Stripe-class APIs (not claimed yet).

---

## Outreach timing (CEO / De Goes)

He is publicly pressure-testing frameworks that overclaim durability. His Golem 1.6 reply already gave the trade-off in his words — use that. Order:

1. Send the measured Tier C claim + evidence now (A/B/D CI-gated; C N=1000 on R2 — [STATUS](../benchmarks/durability-proof/STATUS.md)). Claim: _Across 1,000 crashes injected at every phase of a write, programs resumed on another node with no repeated writes (the 95% upper bound on the duplicate rate is 0.3%). The median resume took about 12 seconds, set by the lease timeout. Writes caught mid-flight are marked outcome unknown for a person to resolve. Under stock settings, 0.6% of surviving nodes paused themselves for safety, and 0.9% of resumes missed the recovery deadline._ Include the per-phase outcome_unknown table (outer phases 0; aggregate ~48% is targeting), harness, and invitation to break it. Do **not** wait for the preferred TTL/renew tune.
2. Frame with **his** conditions: Golem = complete the work (retry + keys when available); ClawQL = never repeat a consequential write without upstream cooperation. Dual-mode board shows both.
3. Private note: harness + proposed Golem config — “Is this how you’d set it up?” Admit costs up front (12s failover, stock availability rates).
4. Lead with the collaboration pitch above (Golem agent → ClawQL MCP tools → non-idempotent case closed by single-use approvals).
5. Short note with links — not a wall of numbers. **No Golem-named public board before that conversation.**

---

## Copy checklist before publish

- [ ] No “durable agents” / “durable execution” on clawql.com, docs landing, README, or benchmarks unless clearly about vault memory, WORM, DO session state, or journaled programs **with lab/fleet honesty**.
- [ ] “Survives a crash” only with the scoped Tier C claim (failover seconds + availability costs); never without the per-phase unknown framing if quoting the ~48% rate.
- [ ] Preferred production row stays **planned** until measured at stock N; TTL-only 30s always labeled **n=40**.
- [ ] Prefer “at most once” for approved writes; “at least once + stable id” for events.
- [ ] When quoting Golem 1.6, keep his three conditions intact; never imply ClawQL is a durable execution engine or that we already attach mandate idempotency keys.
- [ ] Streams “Durable Objects” always means Cloudflare/celld DO substrate, not Golem.
