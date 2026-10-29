# Write protocol (TLA+) — crash during an outside write

Model-checks the durability comparison board’s write recovery design:

crash mid-write → resume → keys | lookup-by-reference | neither

**Claim style:** _model-checked_ under stated bounds (e.g. 2 writes, clock ≤ 5) — never “provably correct.”

## Why TLA+ (not Lean)

The risk is the **protocol**: crashes, delayed applies, agent retries, and lookup races. TLC explores those interleavings. Lean fits a pure decision function later if useful; a property-based test covers most of that cheaper.

## “Can no longer land” = named server guarantee

A client timeout is **not** enough (LB / retry queue / server backlog can still apply later). The model only moves a write into `canNoLongerLand` via `ServerGuarantee(w, reason)` with one of:

| Reason                        | Real-world meaning                                                       |
| ----------------------------- | ------------------------------------------------------------------------ |
| `server_enforced_expiry`      | Request carried a signed max-age; server rejects past it                 |
| `lookup_covers_prior_accepts` | API documents that this lookup reflects every request accepted before it |
| `connection_rejected`         | Connection-level response proved reject — not unanswered / timed out     |

`LookupNotFoundSafe` requires `w ∈ canNoLongerLand`. Without a named guarantee, the only honest action is `MarkUnknown`.

## Invariants

| Name                   | Meaning                                                    |
| ---------------------- | ---------------------------------------------------------- |
| `NoDuplicateEffect`    | Each logical write applies on the server at most once      |
| `NoFalseDone`          | ClawQL records `done` only if the server applied the write |
| `GuaranteeNamed`       | Every `canNoLongerLand` member has a reason above          |
| `UnknownOnlyWhenStuck` | `unknown` only for neither / ambiguous lookup              |

## Configs (pass **and** counterexample)

A model that only ever passes proves little. Record both:

| Config                         | Role                                          | Expect             | What TLC shows                                  |
| ------------------------------ | --------------------------------------------- | ------------------ | ----------------------------------------------- |
| `WriteProtocol.cfg`            | ClawQL + lookup, race-safe                    | **PASS**           | Safety holds with `ServerGuarantee`             |
| `WriteProtocolKeys.cfg`        | ClawQL + idempotency keys                     | **PASS**           | Keyed redrive ≤1 apply                          |
| `WriteProtocolNeither.cfg`     | ClawQL + neither                              | **PASS**           | May stay unknown; no blind resend               |
| `WriteProtocolWeak.cfg`        | Trust `not_found` **without** ServerGuarantee | **COUNTEREXAMPLE** | `NoDuplicateEffect` — resend then delayed apply |
| `WriteProtocolPeerNeither.cfg` | Peer blind retry on neither                   | **COUNTEREXAMPLE** | `NoDuplicateEffect` — agent retry after apply   |

Weak counterexample shape (recorded from TLC): `SendWrite` → still in flight → `LookupNotFoundWeak` (resend) → `ApplyInflight` (original lands) → `applied = 2`.

Peer-neither shape: `SendWrite` → `ApplyInflight` → `AgentBlindRetry` → `applied = 2`.

```bash
./scripts/formal/run-write-protocol-tlc.sh
```

## Trace checking (bridge to TypeScript)

`DURABILITY_COMPARISON_TRACE=1` exports `TrialTraceEvent` logs. The TypeScript conformance checker (`packages/clawql-api/src/program/durability-comparison/trace-conformance.ts`) maps those events onto the same safety rules (`NoDuplicateEffect`, `NoUnsafeRetry`, `GuaranteeNamed`, structural no blind retry). It is **not** a full TLC replay — it checks exported trial logs against the rules the model encodes.

```bash
DURABILITY_COMPARISON_TRACE=1 DURABILITY_COMPARISON_N=5 npm run benchmark:durability-comparison
# unit: pass + recorded counterexample shapes
npx vitest run packages/clawql-api/src/program/durability-comparison/trace-conformance.test.ts
```

## Mapping to code

| Spec                 | Code / product rule                                         |
| -------------------- | ----------------------------------------------------------- |
| `ServerGuarantee`    | Host sets `not_found.definitive: true` **with** `reason`    |
| `LookupNotFoundSafe` | definitive + reason → one safe resend                       |
| `LookupNotFoundWeak` | **forbidden** — definitive without a named server guarantee |
| `MarkUnknown`        | no guarantee → `outcome_unknown`                            |
| `AgentRetryRefused`  | ClawQL structural gate                                      |
| `AgentBlindRetry`    | Pi/Golem out of the box on API type neither                 |
