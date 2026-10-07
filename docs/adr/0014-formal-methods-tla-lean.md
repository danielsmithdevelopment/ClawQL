# ADR 0014: Formal methods — TLA+ for protocols, Lean for policy

- Status: Accepted
- Date: 2026-10-07
- Related: [ADR 0013 gdp-ts](./0013-gdp-ts-compile-time-auth-proofs.md), [correctness by construction](../design/correctness-by-construction.md), [execute pause/resume](../specs/risk/execute-pause-resume-v0.1.md), [`formal/tla/mandate/`](../../formal/tla/mandate/)

## Context

ClawQL’s risk splits into two classes E2E and gdp-ts do not close:

1. **Concurrency and protocol bugs** — races across gateway replicas, retries, expiry, resume. E2E almost never enumerates interleavings.
2. **Decision logic bugs** — risk classification, approval policy, information-flow, mandate binding. Types catch missing proofs; they do not prove the policy function itself.

Lean and TLA+ (or Quint) are the mature tools for those halves. Bend aims at a similar niche with agent-speed checks but is not yet mature enough to adopt. Verus/Kani remain a later option for celld’s Rust sandbox core.

## Decision

1. **Adopt TLA+ (or Quint) for distributed protocol state machines.** Model-check with TLC (or Quint’s checker). First target: **mandate / pending-execution lifecycle**. Follow-ons: event delivery (exactly-once per replica group, resume), resumable jobs (erase / account delete ordering), skill-promotion races.
2. **Adopt Lean for the policy kernel oracle** — not as production runtime. Pattern (AWS Cedar):
   - Small Lean model of risk classification, approval rules, information-flow, mandate binding.
   - Prove invariants in Lean (e.g. deletes never allowed under rule X; approver ≠ requester).
   - Differential tests: same random inputs to Lean and production TypeScript/Rust; any disagreement fails CI.
3. **Keep gdp-ts as layer-1 compile-time capability flow** ([ADR 0013](./0013-gdp-ts-compile-time-auth-proofs.md)). Formal methods do not replace it.
4. **Keep pstack / E2E catalog as runtime evidence.** Formal specs are design-time oracles; E2E proves the running product.
5. **Watch Bend; do not block on it.** Same role as Lean for agent-speed checks when mature.
6. **Ship specs under `formal/`** next to the products they constrain. Mandate starter: [`formal/tla/mandate/`](../../formal/tla/mandate/).

### How the stack fits

| Tool                 | Proves                                 | Use it for                                       |
| -------------------- | -------------------------------------- | ------------------------------------------------ |
| TLA+ or Quint        | No bad interleaving exists             | Mandates, events, jobs, promotion races          |
| Lean                 | Decision logic correct for every input | Policy kernel + differential tests vs production |
| gdp-ts               | Capabilities flow at compile time      | Layer 1 (already)                                |
| Verus or Kani        | Specific Rust functions                | Later — celld sandbox core                       |
| pstack + E2E catalog | Running product behaves                | Runtime evidence                                 |
| Bend                 | Agent-speed checks (aspirational)      | Watch only                                       |

### Where to start

1. **TLA+ mandate lifecycle** — shipped under [`formal/tla/mandate/`](../../formal/tla/mandate/). TLC found the double-execute race under `WeakConsume`; production now uses **atomic consume** (`approved` → `outcome_unknown`). CI runs both configs: atomic must pass, weak must still counterexample (`.github/workflows/formal-mandate-tlc.yml`).
2. **Lean approval-policy model** — tight first slice in [`formal/lean/`](../../formal/lean/) + differential tests vs `packages/clawql-api/src/policy/`. Risk classification / information-flow follow once that loop is solid.

Quint is an acceptable front end if TLA+ syntax is a barrier; semantics stay the same.

## Consequences

- Protocol changes to mandates / events / erase / promotion must update the corresponding TLA+/Quint spec and keep TLC green (or document deliberate model changes).
- The weak-config counterexample is a **regression oracle** — do not “fix” it by weakening Safety.
- Policy-kernel changes update the Lean model and differential suite.
- Crash after consume leaves `outcome_unknown` in Review + WORM; retry only with `clawql-mandate:<executionId>` idempotency keys.
- Security / marketing claim (“model-checked approval protocol”) is allowed once TLC CI is green **and** the atomic consume fix is shipped — back with this ADR and the weak-config counterexample that was fixed.
