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

| Allowed claim                                                                                                        | Basis                                                                                                                                         | Forbidden paraphrase                                                                                       |
| -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| **Approved writes run at most once** across concurrent replicas / crash races                                        | TLA+ model + single-use mandate implementation; file-journal kill-mid-write board ([STATUS](../benchmarks/durability-proof/STATUS.md) Tier D) | “Durable execution,” “exactly-once delivery over HTTP,” “fault-tolerant agent runtime”                     |
| **Events are delivered at least once with stable IDs**; receivers that dedupe process once                           | Events formal model / launch caption honesty                                                                                                  | “Delivered exactly once”                                                                                   |
| **Erasure jobs resume** after interruption                                                                           | Product behavior                                                                                                                              | “Agents resume mid-function”                                                                               |
| **Program-mode crash recovery passes in the lab** (file-journal SIGKILL stand-in + ProgramCellDO isolate kill smoke) | Lab evidence; fleet LTX diagnose + three-arm gate still open                                                                                  | “Programs survive a crash” / “code mode that survives a crash” **in the wild** until the fleet gate passes |
| **Durable Object / celld / LTX** as Streams session substrate                                                        | Spec + Lab 5b                                                                                                                                 | Equating Cloudflare/celld DO session state with Golem-class durable execution                              |

**ClawQL is not a durable execution engine.** Prefer “journaled program resume (lab)” and “at-most-once approved side effects” over “durable agents.”

Env flag **`CLAWQL_ENABLE_DURABLE_PROGRAMS`** means _journaled program resume_, not Golem-style durable execution. Keep that distinction in every sentence that mentions the flag.

---

## Overlap (honest)

| Surface                         | Golem                                  | ClawQL today                                                                                   |
| ------------------------------- | -------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Crash-surviving agent code      | Shipped production mid-function resume | Program mode: lab kill tests; fleet proof pending                                              |
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

1. **Durability, shipped** — finish celld fleet crash test (three-arm + LTX diagnose); until then no wild “survives a crash” claim.
2. **Delegated permissions that narrow and cascade** — time-limited sub-agent slices; revoke parent → revoke children.
3. **Read-only result caching** — specs already mark reads; gateway cache until next write.
4. **Awaitable approvals in SDKs** — same strength as today, easier to code against.
5. **Live-adjustable quotas** — confirm per-key concurrency/rate without redeploy (beyond spend caps).
6. **Published per-unit numbers** — cold start, programs per node, memory per program cell (yardstick vs Golem’s published figures).

**Leave alone:** per-agent databases, hosting agent-built sites, live-updating running agent code — agent-runtime territory.

---

## Benchmark use of Golem

Add a **Golem arm** on the kill-mid-write / program crash board when ready — strongest shipped baseline for “survives a crash without repeating a call.” Matching it is meaningful; publishing with Golem’s name requires maintainer invitation **before** anything public (same as other boards).

Do **not** put Golem on the MCP token/governance pets board as if it were Bifrost/Obot — wrong product shape.

---

## Outreach timing (CEO / De Goes)

He is publicly pressure-testing frameworks that overclaim durability. Order:

1. Fleet LTX / Tier C numbers with precise wording (A/B/D already CI-gated — [STATUS](../benchmarks/durability-proof/STATUS.md)).
2. Private note first: harness + proposed Golem config — “Is this how you’d set it up?”
3. Then results in context: name what Golem does well (shipped durability); state ClawQL’s **narrow** at-most-once write claim + TLA+ + crash evidence; invite him to break it.
4. Lead with interoperability / joint demo (Golem agent → ClawQL MCP tools → park risky writes → survive crash).
5. Short note with links — not a wall of numbers. **No Golem-named public board before that conversation.**

---

## Copy checklist before publish

- [ ] No “durable agents” / “durable execution” on clawql.com, docs landing, README, or benchmarks unless clearly about vault memory, WORM, DO session state, or journaled programs **with lab/fleet honesty**.
- [ ] “Survives a crash” only after fleet three-arm gate; until then “lab” / “Partial” / “stand-in.”
- [ ] Prefer “at most once” for approved writes; “at least once + stable id” for events.
- [ ] Streams “Durable Objects” always means Cloudflare/celld DO substrate, not Golem.
