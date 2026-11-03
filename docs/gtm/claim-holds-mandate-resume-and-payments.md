# Claim posture — mandate resume + payments (cleared pre-public)

**Status:** **CLEARED for ship** (2026-11-03). Nothing was used publicly yet —
no marketing retract. Ship the scoped claims below; do not re-widen them.

| Claim | Posture | Evidence |
| ----- | ------- | -------- |
| Approvals are single-use (catalog **and** native resume) | **Ship** | #1459 — CAS consume before native allow; `native-tool-gate-resume.test.ts`; `ResumeById` TLA |
| Wire-transfer / payment-waiting explainer | **Ship only if** framed as gateway catalog tool call | Not `clawql-payments` ACP/ACH/credits |
| Cost Plus “consequential actions wait for a person” | **Ship** scoped to gateway-mediated tool calls | Cost Plus landing + example README |
| “Payments bound to the same patient approval” | **Do not ship** until cash rails use mandate + journal | Permanent scope — not a temporary hold |
| Stripe ACP/ACH no double-charge on crash/retry | **Ship** write-ahead path | #1460 — durable key → Idempotency-Key → record PI; `PaymentsStripeIdempotency` |

## 0. Security fix (pre-public)

Governance integrity: a single approval must never drive more than one native
side effect. Fixed on #1459 before any public npm/Helm/managed release carried
the vulnerable resume path.

- **Advisory:** [`docs/security/advisories/2026-11-03-native-mandate-resume-double-use.md`](../security/advisories/2026-11-03-native-mandate-resume-double-use.md)
- **npm:** latest published **7.2.0** predates the bug (intro 2026-10-19 on `main`).
- **Public retract:** **none** — no released channel shipped the vulnerable path.
- Still publish a GHSA when the fix lands on `main` / 8.0 so operators who ran
  post-Oct-19 `main` images get a clear upgrade signal (trust > silence).
- **Operator hunt:** `node scripts/formal/audit-mandate-double-execute.mjs --dir "$CLAWQL_HOME/worm"`

## 1. Single-use approvals — cleared to ship

Native resume with `approvedExecutionId` now atomically
`tryConsumeApprovedMandate` before allow; wrap/govern finalize after.
Regression + MandateLifecycle `ResumeById` / `WeakResumeById` cover the path.

**Shippable wording:** Approvals for **gateway-mediated tool calls** (catalog
`execute` / native tools under operation-risk enforce) are spent once.

**Not shippable:** implying `clawql-payments` cash rails share that mandate
consume path.

## 2. Payments vs patient approval — permanent scope (never overclaim)

`clawql-payments` money writes remain **PARTIAL** on mandate and **NO** on the
program write-intent journal
([`docs/payments/crash-safety-coverage.md`](../payments/crash-safety-coverage.md)).
They have their own ledger/idempotency/Stripe write-ahead evidence — they do
**not** inherit the 1,000-crash board’s journal resume claim.

Keep “payments bound to the same patient approval” out of Cost Plus / GTM until
routing exists. That is accurate product scope, not a temporary hold.

## 3. Stripe write-ahead — cleared by #1460

ACP complete + ACH top-up persist a durable idempotency key **before**
`paymentIntents.create`, record the PI after, reuse the key on retry, and look
up by metadata after Stripe’s ~24h window. Formal invariant: `AtMostOneCharge`.

## Formal / product queue (not claim blockers)

1. celld lease/supersede (PR #1456 vendor lab)
2. Payments hold+compensation TLA + transitions (#1458)
3. OAuth/PKCE + HTTP session IFC labels (accumulate only)
4. Account deletion vs WORM
5. Program proposal graph
