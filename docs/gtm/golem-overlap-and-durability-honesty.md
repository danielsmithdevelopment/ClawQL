# Golem overlap, interoperability, and durability claim honesty

**Status:** internal GTM + product honesty (not a published category board)  
**Audience:** anyone writing public copy, benchmarks, or outreach about durability / program mode  
**Related:** [ADR 0015](../adr/0015-program-mode-alongside-search-execute.md) · [dominance roadmap](../benchmarks/dominance-roadmap.md) · [mcp-tools § Durable programs](../mcp/mcp-tools.md#durable-programs) · [streams-celld evidence](../streams/streams-celld-evidence.md)  
**External:** [golem.cloud](https://golem.cloud/) · John De Goes durability pressure ([X](https://x.com/jdegoes/status/2112657693349744841))

---

## One-liner

**Golem makes execution durable. ClawQL governs remote effects.** Interoperate over MCP; do not compete as a durable execution engine.

---

## Two kinds of “durable” (do not conflate)

Public arguments over “Pi runs durably” usually mix two claims. Both can be true:

| Kind                     | Meaning                                                                                               | Who owns it                                                                                                                                                             |
| ------------------------ | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Execution durability** | The program survives a crash and continues where it left off (replay / VM / journal of control flow). | Runtimes like **Golem** (code + in-Golem tools/DBs). John is right that off-the-shelf Pi + tools-on-Golem can get this “automatically.”                                 |
| **Effect durability**    | What the program did to the **outside world** happens exactly once.                                   | **Not** any runtime alone for arbitrary remote POSTs. Needs upstream idempotency (or a governance layer). The other side of the thread is right that this is not magic. |

John agrees he would never claim every remote tool is made durable automatically. ClawQL lives in that agreed gap: it does **not** make remote calls durable either. It **governs** them:

- **At most once**, whether or not the upstream supports idempotency
- **Approved by a person** when risky
- **Recorded** on a tamper-evident trail
- **Exactly once** where the upstream honors keys — REST mandate `Idempotency-Key` is shipped; program-runner keyed resume still planned

Never write “ClawQL makes agents durable.” Prefer “governs remote effects” / “at-most-once approved writes” / “journaled program resume (lab).”

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

**What it would take to earn a named step-level durable-execution claim** (checkpointed steps, not mid-line transparency): [durable-execution-claim-path.md](./durable-execution-claim-path.md). Ready-now public wording: [publish-readiness.md](./publish-readiness.md).

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

## Why “outcome unknown” (and why that does not undermine durability)

When a program sends a charge and the cell dies before the reply arrives, two cases look identical from ClawQL’s side: the API processed the charge and the reply was lost, or the request never arrived. The answer lives on the API’s side. That is a distributed-systems fact, not a ClawQL limitation.

**Durability claim (what the board proves today):** the program survives, the write is **never repeated**, and the in-flight case is **never lost silently** — it is recorded as `outcome_unknown`. That is the honest version of a limit every system faces. Blind retry (“at least once”) is the other side of the same trade-off (Golem when the API has no keys).

**Do not frame recovery as only three options** (retry / stay silent / mark unknown). **Check, then decide** is the preferred strategy when the API allows it — and it must be careful, not a guess:

1. **Match by unique reference, not by “looks similar.”** Tag every write with a stable id before send (approval / execution id). Ask “is there a charge with _this_ reference?”, not “is there a recent successful charge for this customer/amount?” — the latter can match a different legitimate charge and skip a needed write.
2. **“Not found” ≠ “failed” yet.** The original may still be in flight, or search may lag. Retrying too soon can double-charge when the original lands later. Treat not-found as failure only after the original can no longer succeed: wait out the API’s max lifetime, cancel/void if the API allows, or read from a source the API guarantees is current.
3. **Then decide.** Found by reference → record success. Not found and the original can no longer land → safe to send once more with the same reference. Still ambiguous (no lookup by reference, no fresh read, no cancel) → person.

**Where `outcome_unknown` belongs:** only the moment a call is in flight **and** neither idempotency keys nor a sound verify path exist. The board aims half its kills at that window on purpose; in production the window is milliseconds, so unknowns are rare. Aggregate “~48% unknown” is a targeting artifact — see [AVAILABILITY.md](../benchmarks/program-cell-fleet-kill/AVAILABILITY.md).

---

## Product improvement: resolve in-flight unknowns

Default: **never guess, never silent-drop, never blind-retry**. When the catalog shows a way to find out, find out.

| Capability                                  | Status                               | Behavior                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------------------------------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Idempotency keys** (Stripe-class)         | **Shipped (REST + program journal)** | OpenAPI ops that declare header `Idempotency-Key` (or `x-clawql-idempotencyCapable`) park as `idempotencyCapable`. After mandate consume, REST sends `Idempotency-Key: clawql-mandate:<executionId>`. Program durable-runner: when `resolveRisk.idempotencyCapable`, an in-flight write resumes with a **keyed re-drive** (plan `idempotencyKey` or `clawql-program:<id>:<index>`); otherwise `outcome_unknown`. |
| **Check-then-decide (lookup by reference)** | **Planned**                          | Spec-driven “is there an effect with _this_ reference?” after the original can no longer land; then record success or one safe resend. Exact match only — not “similar recent charge.”                                                                                                                                                                                                                           |
| **Neither**                                 | Shipped                              | Stay **at most once**; person marks applied / not applied.                                                                                                                                                                                                                                                                                                                                                       |

Crash-during-outside-write comparison board measures keyed resume on the idempotent mock (0 dups / 0 unknowns) and unchanged `outcome_unknown` on the non-idempotent mock.

---

## Measure resume vs journal length (planned — find it yourself)

Replay-based recovery can slow down as history grows; state-first / snapshot systems exist for that reason (same pattern as long-session cost elsewhere). Program mode should measure **before** someone else points it out in a thread:

| Board         | What to measure                                                                 |
| ------------- | ------------------------------------------------------------------------------- |
| Short program | Resume wall time after SIGKILL / peer failover (already in Tier C `resumeMs`)   |
| Long program  | Same resume clock vs journal record count / bytes (fan-out of N steps, large N) |

If resume time grows with journal length, add **periodic snapshots** so resume replays only from the last snapshot (plus the short tail). Until measured, do not claim linear or constant resume cost. Status: **planned** — not a Tier C gate for John outreach.

---

## Gaps to close (order)

1. **Durability, shipped** — Tier C fleet phased kill on R2 is measured (N=1000, 0 dups); preferred renew/lease tune still planned. Head-to-head Golem arm still open.
2. **Check-then-decide lookup** — pair write ops with lookup-by-reference from the spec (above); keys already on the REST wire.
3. **Resume vs journal length** — measure; snapshot if growth is material (above).
4. **Delegated permissions that narrow and cascade** — time-limited sub-agent slices; revoke parent → revoke children.
5. **Read-only result caching** — specs already mark reads; gateway cache until next write.
6. **Awaitable approvals in SDKs** — same strength as today, easier to code against.
7. **Live-adjustable quotas** — confirm per-key concurrency/rate without redeploy (beyond spend caps).
8. **Published per-unit numbers** — cold start, programs per node, memory per program cell (yardstick vs Golem’s published figures).

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

## Collaboration pitch (private — not the public thread)

**Do not join the public argument** over whether “Pi runs durably” is magic. Both sides are right about different meanings of durable; jumping mid-dispute reads as taking sides against someone you want to work with.

**Message John directly**, using his own distinction:

> Golem makes **execution** durable; ClawQL governs the **remote effects** you both agree no runtime can make durable on its own — at most once, approved, audited, and exactly once where idempotency keys exist. Here are the crash-test numbers. Want to check our setup and show the combination together?

Body: (1) execution vs effect durability; (2) his three conditions, acknowledged; (3) Tier C claim + evidence + dual-mode board; (4) invite Golem-arm config; (5) REST mandate keys shipped + check-then-decide lookup still planned (not overclaimed).

**Later — own calm public post** on the two kinds of durability with measured data, without referencing the argument. Readers following the debate will find it; it answers the question both left open. Not a dunk.

---

## Outreach timing (CEO / De Goes)

He is publicly pressure-testing frameworks that overclaim durability. Use his framing privately; stay out of the quote-tweet fight. Order:

1. **Private DM / email first** — point at the public board **[clawql.com/benchmarks#durability](https://clawql.com/benchmarks#durability)** plus evidence (A/B/D CI-gated; C N=1000 on R2 — [STATUS](../benchmarks/durability-proof/STATUS.md)). Claim: _Across 1,000 crashes injected at every phase of a write, programs resumed on another node with no repeated writes (the 95% upper bound on the duplicate rate is 0.3%). The median resume took about 12 seconds, set by the lease timeout. Writes caught mid-flight are marked outcome unknown for a person to resolve. Under stock settings, 0.6% of surviving nodes paused themselves for safety, and 0.9% of resumes missed the recovery deadline._ Per-phase unknown table, harness, invitation to check the setup. Do **not** wait for preferred TTL tune or journal-length board.
2. Frame **execution durability (Golem) vs effect governance (ClawQL)** — the gap both sides of the thread already agree on.
3. Dual-mode board design + “is this how you’d configure the Golem arm?”
4. Optional later: calm post on two kinds of durability (no mention of the dispute).
5. Short note with links — not a wall of numbers. **No Golem-named public board before that conversation. No pile-on in his thread.**

---

## Copy checklist before publish

- [ ] No “durable agents” / “durable execution” on clawql.com, docs landing, README, or benchmarks unless clearly about vault memory, WORM, DO session state, or journaled programs **with lab/fleet honesty**.
- [ ] Separate **execution durability** from **effect durability** whenever “durable” appears next to Golem or Pi.
- [ ] “Survives a crash” only with the scoped Tier C claim (failover seconds + availability costs); never without the per-phase unknown framing if quoting the ~48% rate.
- [ ] Preferred production row stays **planned** until measured at stock N; TTL-only 30s always labeled **n=40**.
- [ ] Prefer “at most once” for approved writes; “at least once + stable id” for events.
- [ ] When quoting Golem 1.6, keep his three conditions intact; never imply ClawQL is a durable execution engine. REST mandate keys are shipped; do not claim program-runner keyed resume or lookup reconciliation until measured.
- [ ] Do not frame in-flight recovery as only “retry / silent / person” — lead with check-by-reference (exact match; not-found ≠ failed yet), then keys, then person.
- [ ] Do not claim constant resume cost until journal-length board exists.
- [ ] Streams “Durable Objects” always means Cloudflare/celld DO substrate, not Golem.
