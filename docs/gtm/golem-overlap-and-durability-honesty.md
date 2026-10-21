# Golem overlap, interoperability, and durability claim honesty

**Status:** internal GTM + product honesty (not a published category board)  
**Audience:** anyone writing public copy, benchmarks, or outreach about durability / program mode  
**Related:** [ADR 0015](../adr/0015-program-mode-alongside-search-execute.md) · [dominance roadmap](../benchmarks/dominance-roadmap.md) · [mcp-tools § Durable programs](../mcp/mcp-tools.md#durable-programs) · [streams-celld evidence](../streams/streams-celld-evidence.md)  
**External:** [golem.cloud](https://golem.cloud/) · John De Goes durability pressure ([X](https://x.com/jdegoes/status/2112657693349744841))

---

## One-liner

**Golem keeps the agent durable. ClawQL governs what its tools may do.** Interoperate over MCP; do not compete as a durable execution engine.

---

## What Golem is (accurate for our positioning)

A runtime where agents are ordinary code in per-agent WebAssembly VMs with durability built in: resume mid-function after restarts, rescaling, long waits, and crashes. Outbound calls go through a host choke point that checks permissions and records them. Tool calls are worded as exactly-once **when the callee honors idempotency keys** Golem adds (Stripe-class). Secrets can be opaque handles; revealing a value needs a grant. BSL → Apache 2.0 later (not OSI open source today).

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

## Gaps to close (order)

1. **Durability, shipped** — Tier C fleet phased kill on R2 is measured (N=1000, 0 dups); preferred renew/lease tune still planned. Head-to-head Golem arm still open.
2. **Delegated permissions that narrow and cascade** — time-limited sub-agent slices; revoke parent → revoke children.
3. **Read-only result caching** — specs already mark reads; gateway cache until next write.
4. **Awaitable approvals in SDKs** — same strength as today, easier to code against.
5. **Live-adjustable quotas** — confirm per-key concurrency/rate without redeploy (beyond spend caps).
6. **Published per-unit numbers** — cold start, programs per node, memory per program cell (yardstick vs Golem’s published figures).

**Leave alone:** per-agent databases, hosting agent-built sites, live-updating running agent code — agent-runtime territory.

---

## Benchmark use of Golem (and Pi Durable)

Full board plan: [`docs/benchmarks/durability-proof/COMPARISON.md`](../benchmarks/durability-proof/COMPARISON.md).

- **celld** is ClawQL’s substrate (Tiers B/C), not a third rival.
- **Pi Durable** (harness) and **Golem** (execution runtime) are the peer arms.
- Score **duplicates** and **lost / `outcome_unknown`** under kill-mid-write; run idempotency-honoring **and** non-idempotent upstreams.
- Include **Pi Durable + ClawQL** and **Golem + ClawQL** combination arms (runtime keeps the agent alive; ClawQL keeps writes at most once).
- Named public boards need maintainer invitation first. ClawQL-only Tier C numbers are ready for private outreach; named peer boards still wait on invite.

Do **not** put Golem on the MCP token/governance pets board as if it were Bifrost/Obot — wrong product shape.

---

## Outreach timing (CEO / De Goes)

He is publicly pressure-testing frameworks that overclaim durability. Order:

1. Send the measured Tier C claim + evidence now (A/B/D CI-gated; C N=1000 on R2 — [STATUS](../benchmarks/durability-proof/STATUS.md)). Claim: _Across 1,000 crashes injected at every phase of a write, programs resumed on another node with no repeated writes (the 95% upper bound on the duplicate rate is 0.3%). The median resume took about 12 seconds, set by the lease timeout. Writes caught mid-flight are marked outcome unknown for a person to resolve. Under stock settings, 0.6% of surviving nodes paused themselves for safety, and 0.9% of resumes missed the recovery deadline._ Include the per-phase outcome_unknown table (outer phases 0; aggregate ~48% is targeting), harness, and invitation to break it. Do **not** wait for the preferred TTL/renew tune.
2. Private note: harness + proposed Golem config — “Is this how you’d set it up?” Admit costs up front (12s failover, stock availability rates) — that is what separates this from overclaimed durability.
3. Honest comparison: Golem has no published crash/failover numbers like yours; you are likely ahead on never repeating a write without upstream idempotency, probably behind on failover speed, unmeasured on cold start/density until a shared board. Do not overclaim the comparison.
4. Lead with interoperability / joint demo (Golem agent → ClawQL MCP tools → park risky writes → survive crash).
5. Short note with links — not a wall of numbers. **No Golem-named public board before that conversation.**

---

## Copy checklist before publish

- [ ] No “durable agents” / “durable execution” on clawql.com, docs landing, README, or benchmarks unless clearly about vault memory, WORM, DO session state, or journaled programs **with lab/fleet honesty**.
- [ ] “Survives a crash” only with the scoped Tier C claim (failover seconds + availability costs); never without the per-phase unknown framing if quoting the ~48% rate.
- [ ] Preferred production row stays **planned** until measured at stock N; TTL-only 30s always labeled **n=40**.
- [ ] Prefer “at most once” for approved writes; “at least once + stable id” for events.
- [ ] Streams “Durable Objects” always means Cloudflare/celld DO substrate, not Golem.
