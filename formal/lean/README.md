# Lean policy kernel (approval evaluation)

Tight first slice of ADR 0014’s Lean plan: **approval-policy evaluation only**.

| Artifact | Role |
| --- | --- |
| `ApprovalPolicy.lean` | Lean model + proof stubs |
| `../packages/clawql-api/src/policy/approval-policy.ts` | Production evaluator |
| `../packages/clawql-api/src/policy/approval-policy-oracle.ts` | TS mirror of the Lean function |
| `approval-policy.differential.test.ts` | Random differential suite (thousands of cases) |

Risk classification and information-flow join once this loop is green end-to-end (`lake build` + CI).

```bash
# When elan/lake available:
lake build   # from a future lakefile in this directory
# Differential (always in package tests):
npm test -w clawql-api -- src/policy/approval-policy.differential.test.ts
```
