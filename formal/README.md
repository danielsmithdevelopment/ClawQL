# Formal methods

Design-time models for ClawQL protocols and policy. See [ADR 0014](../docs/adr/0014-formal-methods-tla-lean.md). Verus (code proofs on a Rust data plane) is scoped in [ADR 0016](../docs/adr/0016-rust-dataplane-spike.md) — not yet in this tree.

| Path                                               | Kind                                                     | Status                                                            |
| -------------------------------------------------- | -------------------------------------------------------- | ----------------------------------------------------------------- |
| [`tla/mandate/`](tla/mandate/)                     | TLA+ / TLC — mandate lifecycle + crash/`outcome_unknown` | Atomic SQLite CAS; dual CI                                        |
| [`tla/events/`](tla/events/)                       | TLA+ / TLC — event delivery / resume                     | Starter; dual configs                                             |
| [`tla/program/`](tla/program/)                     | TLA+ / TLC — program step resume / no completed re-run   | Claim-path §5; dual configs                                       |
| [`tla/payments/`](tla/payments/)                   | TLA+ / TLC — holds/compensation + Stripe write-ahead     | Dual configs; **not** covered by mandate/journal — see README     |
| [`tla/lease/`](tla/lease/)                         | TLA+ / TLC — lease sweep expiry ≠ dead                   | Dual configs; open-log abandon only on process evidence           |
| [`tla/oauth/`](tla/oauth/)                         | TLA+ / TLC — OAuth auth-code + PKCE single-use           | Dual configs; delete-on-read consume                              |
| [`lean/`](lean/)                                   | Lean — approval-policy + IFC oracles                     | No-sorry CI + differential + exhaustive                           |
| _(planned)_ `crates/clawql-dataplane/` Verus specs | Verus — policy / labels / digests on running Rust        | Spike only — [ADR 0016](../docs/adr/0016-rust-dataplane-spike.md) |

**Tools:** [TLA+ Toolbox](https://lamport.azurewebsites.net/tla/toolbox.html) or [`tla2tools.jar`](https://github.com/tlaplus/tlaplus) + Java (`scripts/formal/run-mandate-tlc.sh`). Lean via elan/lake when available. Quint may be added as a front end later. Verus/PDD Kit for the data-plane trial.

These models do **not** run in production (except future Verus-verified Rust kernels if ADR 0016 goes). They are oracles and race finders. Production today remains TypeScript + gdp-ts + runtime gates.
