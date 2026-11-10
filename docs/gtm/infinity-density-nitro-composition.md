# Infinity density, durability, and Nitro composition

**Status:** internal GTM honesty · recorded 2026-11-10  
**Audience:** density board owners, Cloud isolation-tier design, anyone tempted to say “denser than Infinity”  
**Related:** [program-density STATUS](../benchmarks/program-density/STATUS.md) · [Cloud platform plan](./clawql-cloud-platform-plan.md) · [durability competition](./durability-competition-comparison.md) · [V4 claim](../benchmarks/program-cell-fleet-kill/V4_CLAIM.md) · [publish readiness](./publish-readiness.md)

---

## Number correction (do not say 33%)

From ClawQL’s own Infinity comparison board: Infinity reached **77,500** and ClawQL **100,000**, verified under the **2× latency gate** — about **29% more**, not 33%.

ClawQL’s arm measured **matched-shape history appends** rather than the full runtime, so the claim so far is about **history-storage memory**, not full-stack density.

**Gate:** sending the board to Shadaj Laddad’s team for review before claiming “denser than” is still **pending**. No public “denser than Infinity” until that review (same rule as Golem/Pi).

## Should density be tested with durability on?

**Yes — and it matters for both sides.**

Infinity’s headline figure came from a benchmark using ~80,000 agents on a single thread of an AMD EPYC 9R14, with **in-memory stores**. In-memory stores are not durable. Its durable deployment path is different: serverless platforms such as AWS Lambda with SQS and Aurora DSQL, requiring no compute while agents wait.

So neither number yet answers the real question: **how many agents fit per node with crash-safety actually on?**

A combined board should measure:

| Arm | Question |
| --- | --- |
| **Memory per agent with the full durability stack** | Journal, leases, and output gate all active |
| **Crash-safety at density** | Existing kill phases, **plus an out-of-memory kill** (realistic when a node runs near its limit) |
| **Recovery storms** | What happens when a node holding ~100,000 agents dies and they all need to resume at once — with remesure self-fence resume p50 ≈17s, this is the number most likely to surprise |

**Freeze criteria first:** zero wrong outcomes, availability ≤2%, and a **recovery-time target at full density**. Then invite Infinity’s team to run their **durable** configuration on the same host, so both arms carry the same guarantees.

## Do Infinity-style density and Nitro Sandboxes compose?

**Yes, at different layers.**

Infinity achieves density because the runtime treats each tool call as a suspension point, saves conversation history as the agent’s continuation, and resumes when a message arrives — many agents share a few threads inside **one process**. That gives **no isolation between agents**; they are coroutines in the same process.

Nitro Sandboxes provide the opposite: a **hardware VM boundary**, with VM-level overhead. Putting each agent in its own VM would destroy the density. Putting **one tenant’s runtime** in a VM keeps it.

### Composition

| Layer | What runs | Isolation |
| --- | --- | --- |
| **Between tenants** | One Nitro Sandbox per tenant (Cloud dedicated tier) | Hardware isolation + attestation-gated secrets |
| **Within a tenant** | Dense runtime holding that tenant’s parked agents (celld for ClawQL; Infinity for theirs) | Shared process / coroutine density |
| **Code agents execute** | Separate sandbox per execution | Per-workload isolation where it matters |

That maps onto Cloud isolation tiers directly, and is how ClawQL can keep a density advantage while offering hardware isolation.

## Collaboration, not rivalry

Laddad’s team argues for automated correctness checks that operate **outside** an AI agent’s control — the same premise as ClawQL. Prefer inviting a joint durable-at-density board over marketing “denser than.”
