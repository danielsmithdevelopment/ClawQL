# Durability proof ladder — STATUS

**Goal:** Earn a defensible claim that **journaled programs survive SIGKILL without repeating writes**, plus the twin claim that **approved writes are at most once** under crash races — without claiming ClawQL is a durable execution engine ([Golem honesty](../../gtm/golem-overlap-and-durability-honesty.md)).

**Live marketing:** [clawql.com/benchmarks#durability](https://clawql.com/benchmarks#durability) publishes the measured Tier C claim, per-phase table, three columns, and ladder. Chip elsewhere: **Lab Yes · fleet Yes (R2 peer kill)**. Still not a durable execution engine. Peer boards vs Pi Durable / Golem wait on maintainer invite.

## Scoped Tier C claim (measured — stock R2)

> Across 1,000 crashes injected at every phase of a write, programs resumed on another node with no repeated writes (the 95% upper bound on the duplicate rate is 0.3%). The median resume took about 12 seconds, set by the lease timeout. Writes caught mid-flight are marked outcome unknown for a person to resolve. Under stock settings, 0.6% of surviving nodes paused themselves for safety, and 0.9% of resumes missed the recovery deadline.

Every number is measured. Availability costs are stated rather than left for the reader to discover. Scope: two celld nodes, one storage provider (Cloudflare R2). Avoid “durable execution” and “exactly once.”

### Outcome unknown ~48% — read the per-phase table

Aggregate “about half unknown” is a targeting artifact: kills are aimed evenly at four phases; two are the in-flight window. Evidence: [`phased-evidence.json`](../program-cell-fleet-kill/phased-evidence.json) · narrative [`AVAILABILITY.md`](../program-cell-fleet-kill/AVAILABILITY.md).

| Kill phase                        | Outcome unknown        |
| --------------------------------- | ---------------------- |
| Before the approval is consumed   | **0** / 252            |
| After intent recorded             | **240** / 248 (~96.8%) |
| During the call                   | **241** / 251 (~96.0%) |
| After the call, before journaling | **0** / 249            |

In real operation, crashes mostly land outside the brief in-flight window, so unknown outcomes are far rarer than this targeted test shows. Nonzero on either outer phase is a bug, not a number to explain.

### TTL tradeoff rows

| Row                  | Status                                | Evidence                                                                                                                      |
| -------------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| stock (`TTL=10s`)    | **Measured** N=1000                   | [`phased-evidence.json`](../program-cell-fleet-kill/phased-evidence.json)                                                     |
| TTL-only 30s         | **Measured** n=40 (label sample size) | [`ttl30-evidence.json`](../program-cell-fleet-kill/ttl30-evidence.json) — failover ~32s                                       |
| production_preferred | **Planned** — not a result            | Same N as stock before any claim; renew ⅕ + regional leases — [`TTL-TRADEOFF.md`](../program-cell-fleet-kill/TTL-TRADEOFF.md) |

Prefer renew-every-⅕ + regional leases over TTL stretch. Do not publish preferred as measured.

### Enough to contact John

Send the claim above, the evidence JSON, the per-phase table, the harness, the honest caveats (12-second failover; stock 0.6% self-fence / 0.9% deadline miss), and an invitation to try breaking it. Do not wait for the tuned configuration.

**Engage privately, not in the public thread.** Both sides of the “is Pi magically durable?” fight are right about different meanings — [execution vs effect durability](../../gtm/golem-overlap-and-durability-honesty.md#two-kinds-of-durable-do-not-conflate). DM John with: Golem makes execution durable; ClawQL governs remote effects neither runtime claims to make durable alone — at most once, approved, audited; crash numbers; check our setup. Later: own calm post on the two kinds, with data, no dunk. Pitch text: [collaboration pitch](../../gtm/golem-overlap-and-durability-honesty.md#collaboration-pitch-private--not-the-public-thread).

**Also planned (not a gate for outreach):** resume time vs journal length; snapshots if growth is material — [honesty § measure](../../gtm/golem-overlap-and-durability-honesty.md#measure-resume-vs-journal-length-planned--find-it-yourself).

---

## Claim inventory (what we are proving)

| Claim                                                                               | Tier that earns it                      |
| ----------------------------------------------------------------------------------- | --------------------------------------- |
| File-journal program: SIGKILL → resume, writes `outcome_unknown` (no re-send)       | **A**                                   |
| ProgramCellDO (celld DO journal): SIGKILL celld → same contract                     | **B**                                   |
| Same as B on multi-node fleet + LTX diagnose + host WORM audit continuity           | **C** (wild “survives a crash”)         |
| Mandate / approved-write: kill mid-consume → zero duplicate side effects (N trials) | **D** (security suite `kill_mid_write`) |

---

## Ladder

| Tier   | Name                                  | Status                                           | Evidence / command                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------ | ------------------------------------- | ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A**  | File-journal SIGKILL stand-in         | **Yes** (CI-gated)                               | [`program-kill-node-standin/evidence.json`](../program-kill-node-standin/evidence.json) · `npm run demo:kill-node-standin` · workflow `program-durability.yml`                                                                                                                                                                                                                                                                                                                                                                                                                                |
| **B**  | ProgramCellDO isolate SIGKILL         | **Yes** (CI-gated when streams-celld paths fire) | [`program-cell-isolate-kill/evidence.json`](../program-cell-isolate-kill/evidence.json) · `STREAMS_CELLD_SMOKE_REQUIRED=1 npm run smoke:program-cell-kill -w …` · job on `streams-celld.yml`                                                                                                                                                                                                                                                                                                                                                                                                  |
| **C**  | Fleet LTX + peer kill                 | **Yes** (lab fleet on R2)                        | PoC: [`program-cell-fleet-kill/evidence.json`](../program-cell-fleet-kill/evidence.json). Phased board: [`phased-evidence.json`](../program-cell-fleet-kill/phased-evidence.json). **Three columns** + failover in claim (~resume p50 seconds). TTL tradeoff rows: [`ttl-tradeoff-evidence.json`](../program-cell-fleet-kill/ttl-tradeoff-evidence.json) · [`TTL-TRADEOFF.md`](../program-cell-fleet-kill/TTL-TRADEOFF.md) · [`AVAILABILITY.md`](../program-cell-fleet-kill/AVAILABILITY.md). Prefer renew cadence + regional leases over TTL-only stretch. Not the AWS three-arm cost board. |
| **D**  | Kill-mid-write board (N trials)       | **Yes** (lab harness; CI N=50)                   | [`security-suite/kill-mid-write/`](../security-suite/kill-mid-write/) · `npm run benchmark:kill-mid-write`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| **D+** | Comparison board (dual columns)       | **Yes** (ClawQL arms; peers pending invite)      | [`comparison/`](./comparison/) · `npm run benchmark:durability-comparison` — duplicates + `outcome_unknown` × idempotent/non_idempotent                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| **E**  | MCP `execute_program` → ProgramCellDO | **Open**                                         | Today `CLAWQL_PROGRAM_CELLD_ISOLATE` is pin/readiness only; Lab HTTP `/program/*` is separate from Core MCP                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| **F**  | Resume vs journal length              | **Planned**                                      | Measure resume wall time at short vs long journals; add periodic snapshots if growth is material ([honesty](../../gtm/golem-overlap-and-durability-honesty.md#measure-resume-vs-journal-length-planned--find-it-yourself)) — not required before John outreach                                                                                                                                                                                                                                                                                                                                |

---

## How do our numbers compare to Golem?

We cannot say yet on a shared board — Golem has not published the kind of crash measurement above. Public Golem figures describe different things:

| What's measured                  | Golem (their claims)           | ClawQL (your measurements)                                                                                                                       |
| -------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Starting a unit of work          | 2 ms Agent cold start          | Not yet measured for celld cells                                                                                                                 |
| Memory per unit                  | 1 MB Min memory per agent      | About 471 KB per celld cell (earlier measurements)                                                                                               |
| Density                          | 10,000+ Active agents per node | **Parked fair board `measured`** — [program-density](../program-density/STATUS.md) (first resource exhausted = **disk** at ~6e6 on this host; wake multi-rep spread recorded; not active-at-50ms) |
| Duplicated writes after a crash  | No published crash test        | **0 in 1,000** phased kills                                                                                                                      |
| Failover time after a node crash | No published figure            | About **12 seconds** median, set by the lease                                                                                                    |

**Trade-off (now in his words):** Golem favors completing the work — retry; without upstream keys an interrupted POST can happen twice. ClawQL favors never repeating a consequential action — consume the approval first; cost is an explicit `outcome_unknown` instead of a silent miss or a blind retry. Same unavoidable limit; opposite choices. That does **not** mean “person forever”: when the API supports idempotency keys or lookup-by-reference, the unknown should resolve automatically ([check-then-decide](../../gtm/golem-overlap-and-durability-honesty.md#why-outcome-unknown-and-why-that-does-not-undermine-durability)) — planned, not claimed.

**Where ClawQL is likely ahead:** never repeating a write even against an API that ignores idempotency keys. Confirmed by his “at least once unless keys” framing. “Likely” until both run against the non-idempotent mock on the dual-mode board.

**Where ClawQL is probably behind:** failover speed (~12s lease floor). A mature durable runtime may recover faster — renew more often and keep leases on regional storage.

**Where unmeasured / planned:** celld cold start; **active** agents-per-node (fair parked density is separate — [program-density](../program-density/STATUS.md)); mandate-derived keys **and** reconciliation-by-lookup so Stripe-class (and lookup-capable) APIs auto-resolve in-flight unknowns without dropping at-most-once elsewhere.

**Overall for his critique:** yes — a published crash test with real sample size, a statistical bound, and availability costs stated openly is exactly what he demands. Collaboration angle: Golem + ClawQL covers both sides of _his_ model. Head-to-head waits for a Golem arm on [`COMPARISON.md`](./COMPARISON.md), ideally with his input on configuration.

---

## What “done enough to talk to Golem” means

Minimum before private outreach with numbers:

1. Tiers **A + B + D** green in CI on `main`
2. Tier **C** measured on a 2-node fleet bucket that passes diagnose (**done** — R2 peer kill + phased board; see `phased-evidence.json`)
3. Public copy uses the scoped claim above — not “durable execution engine” / “exactly once”
4. Named Pi Durable / Golem boards still need maintainer invite before public numbers

Peer comparison design (celld = own substrate; Pi Durable + Golem = peers; dual columns + idempotency modes): [`COMPARISON.md`](./COMPARISON.md).

---

## Related

- Comparison board plan — [`COMPARISON.md`](./COMPARISON.md)
- Durable parked-agent density (fair contract) — [`../program-density/STATUS.md`](../program-density/STATUS.md)
- ADR 0015 — [`docs/adr/0015-program-mode-alongside-search-execute.md`](../../adr/0015-program-mode-alongside-search-execute.md)
- Streams evidence — [`docs/streams/streams-celld-evidence.md`](../../streams/streams-celld-evidence.md)
- Security suite roadmap — [`docs/benchmarks/security-suite/ROADMAP.md`](../security-suite/ROADMAP.md)
- Dominance — [`docs/benchmarks/dominance-roadmap.md`](../dominance-roadmap.md)
