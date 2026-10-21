# Durability proof ladder — STATUS

**Goal:** Earn a defensible claim that **journaled programs survive SIGKILL without repeating writes**, plus the twin claim that **approved writes are at most once** under crash races — without claiming ClawQL is a durable execution engine ([Golem honesty](../../gtm/golem-overlap-and-durability-honesty.md)).

**Live marketing:** clawql.com/benchmarks can say **Lab Yes · fleet Yes (R2 peer kill)** for program journal; still not a durable execution engine. Peer boards vs Pi Durable / Golem wait on maintainer invite.

**Scoped Tier C claim (measured):** A program killed mid-run on one node resumed on another and never repeated a write; a write interrupted in flight is marked outcome unknown for a person to resolve. Scope: two celld nodes, one storage provider (Cloudflare R2). Avoid “durable execution” and “exactly once.”

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

| Tier   | Name                                  | Status                                           | Evidence / command                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------ | ------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A**  | File-journal SIGKILL stand-in         | **Yes** (CI-gated)                               | [`program-kill-node-standin/evidence.json`](../program-kill-node-standin/evidence.json) · `npm run demo:kill-node-standin` · workflow `program-durability.yml`                                                                                                                                                                                                                                                            |
| **B**  | ProgramCellDO isolate SIGKILL         | **Yes** (CI-gated when streams-celld paths fire) | [`program-cell-isolate-kill/evidence.json`](../program-cell-isolate-kill/evidence.json) · `STREAMS_CELLD_SMOKE_REQUIRED=1 npm run smoke:program-cell-kill -w …` · job on `streams-celld.yml`                                                                                                                                                                                                                              |
| **C**  | Fleet LTX + peer kill                 | **Yes** (lab fleet on R2)                        | PoC: [`program-cell-fleet-kill/evidence.json`](../program-cell-fleet-kill/evidence.json) · `npm run smoke:program-cell-fleet-kill`. Phased distribution: [`phased-evidence.json`](../program-cell-fleet-kill/phased-evidence.json) · `npm run benchmark:fleet-phased-kill` (`FLEET_PHASED_N`, lab target **1000** for rule-of-three ≈0.3% @95%; resume p999 thinner than a 10k sample). Not the AWS three-arm cost board. |
| **D**  | Kill-mid-write board (N trials)       | **Yes** (lab harness; CI N=50)                   | [`security-suite/kill-mid-write/`](../security-suite/kill-mid-write/) · `npm run benchmark:kill-mid-write`                                                                                                                                                                                                                                                                                                                |
| **D+** | Comparison board (dual columns)       | **Yes** (ClawQL arms; peers pending invite)      | [`comparison/`](./comparison/) · `npm run benchmark:durability-comparison` — duplicates + `outcome_unknown` × idempotent/non_idempotent                                                                                                                                                                                                                                                                                   |
| **E**  | MCP `execute_program` → ProgramCellDO | **Open**                                         | Today `CLAWQL_PROGRAM_CELLD_ISOLATE` is pin/readiness only; Lab HTTP `/program/*` is separate from Core MCP                                                                                                                                                                                                                                                                                                               |

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
- ADR 0015 — [`docs/adr/0015-program-mode-alongside-search-execute.md`](../../adr/0015-program-mode-alongside-search-execute.md)
- Streams evidence — [`docs/streams/streams-celld-evidence.md`](../../streams/streams-celld-evidence.md)
- Security suite roadmap — [`docs/benchmarks/security-suite/ROADMAP.md`](../security-suite/ROADMAP.md)
- Dominance — [`docs/benchmarks/dominance-roadmap.md`](../dominance-roadmap.md)
