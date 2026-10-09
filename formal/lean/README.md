# Lean policy kernel (approval + information flow)

Tight slices of ADR 0014 / ADR 0015 Lean plan.

| Artifact | Role |
| --- | --- |
| `ApprovalPolicy.lean` | Approval-policy model + Prop stubs |
| `InformationFlow.lean` | IFC model + proved lemmas (no `sorry`) |
| `../packages/clawql-api/src/policy/approval-policy.ts` | Production approval evaluator |
| `../packages/clawql-api/src/policy/approval-policy-oracle.ts` | TS mirror of Lean approval |
| `../packages/clawql-api/src/ifc/labels.ts` | Production `mayFlow` / labels |
| `../packages/clawql-api/src/ifc/information-flow-oracle.ts` | TS mirror of Lean IFC |
| `approval-policy.differential.test.ts` | Random differential (approval) |
| `information-flow.differential.test.ts` | Fixture + random differential (IFC) |

**CI gating (same for both modules):**

- `scripts/formal/check-lean-no-sorry.sh` — fails on `sorry` / `admit` under `formal/lean/` (workflow `formal-mandate-tlc.yml`).
- Full `lake build` + `#print axioms` land when the lakefile is added; until then Lean sources are syntax + no-sorry gated, and TypeScript differentials always run in package tests.

```bash
# No-sorry gate (CI):
bash scripts/formal/check-lean-no-sorry.sh

# When elan/lake available:
# lake build   # from a future lakefile in this directory

# Differentials (always in package tests):
npm test -w clawql-api -- src/policy/approval-policy.differential.test.ts
npm test -w clawql-api -- src/ifc/information-flow.differential.test.ts
```
