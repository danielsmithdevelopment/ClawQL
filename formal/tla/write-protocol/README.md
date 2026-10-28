# Write protocol (TLA+) — crash during an outside write

Model-checks the durability comparison board’s write recovery design:

crash mid-write → resume → keys | lookup-by-reference | neither

**Claim style:** _model-checked_ under stated bounds (e.g. 2 writes, every crash/in-flight interleaving in the model) — never “provably correct.”

## Why TLA+ (not Lean)

The risk is the **protocol**: crashes, delayed applies, agent retries, and lookup races. TLC explores those interleavings. Lean fits a pure decision function later if useful; a property-based test covers most of that cheaper.

## Invariants

| Name                   | Meaning                                                       |
| ---------------------- | ------------------------------------------------------------- |
| `NoDuplicateEffect`    | Each logical write applies on the server at most once         |
| `NoFalseDone`          | ClawQL records `done` only if the server applied the write    |
| `NoUnsafeRetry`        | No reconcile/resend while the original request may still land |
| `UnknownOnlyWhenStuck` | `unknown` only when keys/lookup cannot finish the story       |

## Configs

| Config                         | Role                                       | Expect        |
| ------------------------------ | ------------------------------------------ | ------------- |
| `WriteProtocol.cfg`            | ClawQL + lookup, race-safe                 | **PASS**      |
| `WriteProtocolKeys.cfg`        | ClawQL + idempotency keys                  | **PASS**      |
| `WriteProtocolNeither.cfg`     | ClawQL + neither (floor: may stay unknown) | **PASS**      |
| `WriteProtocolWeak.cfg`        | Trust early `not_found` while in flight    | **counterex** |
| `WriteProtocolPeerNeither.cfg` | Peer blind retry on neither                | **counterex** |

`WeakEarlyNotFound = TRUE` is the check-then-decide race: TLC should find the duplicate immediately. That is the strongest reason this model exists now.

## Run

```bash
./scripts/formal/run-write-protocol-tlc.sh
```

## Trace checking (bridge to TypeScript)

Board trials may export event logs when `DURABILITY_COMPARISON_TRACE=1` (`TrialTraceEvent` in the comparison types). Each real trace should be a behavior of this spec (sent → paused/applied → crashed → resumed → lookup → reconciled | outcome_unknown). Conformance checker: planned next to the thousand-trial host run — every conforming trace is evidence the code implements the design; any that doesn’t is a bug tests alone may miss.

## Mapping to code

| Spec                 | Code                                                         |
| -------------------- | ------------------------------------------------------------ |
| `SendWrite` / intent | durable-runner intent journal before execute                 |
| `ApplyInflight`      | remote / mock shop apply (may be delayed)                    |
| `LookupFound`        | `verifyByReference` → `found` → reconciled                   |
| `LookupNotFoundSafe` | `not_found` + `definitive=true` → one safe resend            |
| `LookupNotFoundWeak` | **forbidden** in product — early not_found must stay unknown |
| `MarkUnknown`        | `outcome_unknown` when neither / ambiguous                   |
| `AgentRetryRefused`  | ClawQL mandate consumed / structural gate                    |
| `AgentBlindRetry`    | Pi/Golem out-of-the-box on API type neither                  |
