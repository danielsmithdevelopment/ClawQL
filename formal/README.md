# Formal methods

Design-time models for ClawQL protocols and policy. See [ADR 0014](../docs/adr/0014-formal-methods-tla-lean.md). Verus trial: [ADR 0016](../docs/adr/0016-rust-dataplane-spike.md) (**Accepted conditional**).

| Path                                               | Kind                                                     | Status                                                            |
| -------------------------------------------------- | -------------------------------------------------------- | ----------------------------------------------------------------- |
| [`tla/mandate/`](tla/mandate/)                     | TLA+ / TLC — mandate lifecycle + crash/`outcome_unknown` | Atomic SQLite CAS; dual CI                                        |
| [`tla/events/`](tla/events/)                       | TLA+ / TLC — event delivery / resume                     | Starter; dual configs                                             |
| [`lean/`](lean/)                                   | Lean — approval-policy + IFC oracles                     | No-sorry CI + differential + exhaustive                           |
| [`verus/approval-policy/`](verus/approval-policy/) | Verus — approval policy kernel (abstract `u64` ids)      | **Proved** (Phase C) — [TOOLCHAIN](verus/TOOLCHAIN.md); labels/digests stretch deferred |

**Tools:** [TLA+ Toolbox](https://lamport.azurewebsites.net/tla/toolbox.html) or [`tla2tools.jar`](https://github.com/tlaplus/tlaplus) + Java (`scripts/formal/run-mandate-tlc.sh`). Lean via elan/lake when available. Quint may be added as a front end later. Verus/PDD Kit for the data-plane trial.

These models do **not** run in production (except future Verus-verified Rust kernels if ADR 0016 goes). They are oracles and race finders. Production today remains TypeScript + gdp-ts + runtime gates.
