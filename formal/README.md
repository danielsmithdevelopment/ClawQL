# Formal methods

Design-time models for ClawQL protocols and (soon) policy. See [ADR 0014](../docs/adr/0014-formal-methods-tla-lean.md).

| Path | Kind | Status |
| --- | --- | --- |
| [`tla/mandate/`](tla/mandate/) | TLA+ / TLC — mandate lifecycle + crash/`outcome_unknown` | Atomic fix shipped; dual CI |
| [`lean/`](lean/) | Lean — approval-policy oracle | Starter + TS differential tests |

**Tools:** [TLA+ Toolbox](https://lamport.azurewebsites.net/tla/toolbox.html) or [`tla2tools.jar`](https://github.com/tlaplus/tlaplus) + Java (`scripts/formal/run-mandate-tlc.sh`). Lean via elan/lake when available. Quint may be added as a front end later.

These models do **not** run in production. They are oracles and race finders. Production remains TypeScript/Rust + gdp-ts + runtime gates.
