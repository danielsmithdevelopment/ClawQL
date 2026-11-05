# Payments crash-safety coverage

## Verdict

| Mechanism                             | Covers `clawql-payments` money writes? |
| ------------------------------------- | -------------------------------------- |
| Mandate / `PendingExecution` consume  | **PARTIAL**                            |
| Program journal / write-intent        | **NO**                                 |
| Payments ledger + compensation stores | **YES** (own path)                     |

MandateLifecycle + ProgramResume TLA+ evidence therefore does **not** underwrite
agentic-payments claims. Formal payments safety lives in
[`formal/tla/payments/`](../../formal/tla/payments/).

## Mandate — PARTIAL

- Catalog `execute` parks high-risk ops into PendingExecution and
  `tryConsumeApprovedMandate` before the side effect.
- Payments MCP tools (`CLAWQL_PAYMENTS_MCP_TOOLS=1`) register as native tools.
  They are **not** in `NATIVE_TOOL_POLICY`, so they default to **destructive** and
  can park via `parkMandateExecute`.
- Resume consume: fixed in PR #1459 (`tryConsumeApprovedMandate` CAS before
  native allow) — on `main`.
- Direct Effect services (`CreditsService`, `DeductionService`,
  `AgentCompensationService`, `AcpCheckoutService`), HTTP HATEOAS, Stripe webhooks,
  and ACH top-up **never** touch PendingExecution.
- AP2 JWT “mandate” (`CLAWQL_PAYMENTS_MCP_REQUIRE_AP2`) is auth, not `pex_…`.

## Journal / write-intent — NO

Durable program intents wrap catalog `execute` / program proposals only
(ADR 0015). Payment tool calls and ledger file mutations are not journaled; a
crash after `hold` before `capture`/`release` leaves status `held` with **no**
`outcome_unknown` redrive.

## What payments rely on today

1. Idempotent ledger keys under `withTenantLedgerLock` (single-process today).
2. Capture/release short-circuit via explicit
   `transitionCreditHold` (`hold-transition.ts`).
3. Compensation stage → confirm with `transitionPendingAction`; re-confirm of
   `executed` is a no-op side-effect.
4. Stripe PaymentIntent write-ahead idempotency for ACP complete, ACH top-up, and
   MPP Stripe SPT: durable key → Stripe `Idempotency-Key` → record PI; post-~24h
   metadata lookup before create; **fail closed** if Stripe Search is unavailable
   (`stripe-idempotency.ts`, `PaymentsStripeIdempotency.tla`). ACP also
   short-circuits when session is already `completed` or `payment_intent_id` is
   already on the session.

## Production exposure (priority gate)

| Rail                                     | Managed production charging real customers?                              | Notes                                              |
| ---------------------------------------- | ------------------------------------------------------------------------ | -------------------------------------------------- |
| ACP checkout                             | **No** (opt-in `CLAWQL_ACP_ENABLED`; default off; dry-run for demos)     | Write-ahead required before live merchant SPT      |
| ACH credit top-up                        | **No** on managed waitlist; self-host only when credits + Stripe key set | Live path requires `correlationId` for durable key |
| Platform Stripe Checkout / subscriptions | Separate path (webhook-idempotent)                                       | Not the ACP/ACH write-ahead gap                    |

## Formalization order (agreed)

1. **Payments cluster** — Stripe write-ahead (#1460) + holds/compensation TLA
   (#1458) + money-request status graph; next: ACP checkout status graph.
2. **celld lease / supersede** — lease sweep expiry≠dead TLA on `main`
   (`formal/tla/lease/`); lab Rust + soak evidence still on stack PRs
   (#1456 / #1462 / #1464). Invariant: two live owners never both send; open-log
   abandon only on process evidence.
3. **Security machines** — OAuth/PKCE single-use+expiry+verifier
   (`formal/tla/oauth/`); HTTP session IFC labels only accumulate — Lean
   `labels_only_grow` + TS differential (never drop within a session key).
4. **Account deletion** vs WORM retention (`formal/tla/deletion/`) —
   ordered cascade; crypto-shred vault; single retained `ACCOUNT_DELETED`.
5. **Program proposal** graph (`formal/tla/program/ProgramProposalGraph.*`) —
   settled leaves never re-run; dependents of failed/dropped leaves are dropped.

Structural rule for every machine touched: one explicit `(state, event) → next |
IllegalTransition` function with exhaustive Effect matching, logged for TLC
conformance.
