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
  native allow). Until that ships on `main`, treat single-use native resume as
  held — see advisory draft under `docs/security/advisories/`.
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
4. Stripe PaymentIntent write-ahead idempotency for ACP complete + ACH top-up:
   durable key → Stripe `Idempotency-Key` → record PI; post-~24h metadata lookup
   before create (`stripe-idempotency.ts`, `PaymentsStripeIdempotency.tla`).
   ACP also short-circuits when session is already `completed` or `payment_intent_id`
   is already on the session.

## Production exposure (priority gate)

| Rail                                     | Managed production charging real customers?                              | Notes                                                  |
| ---------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------ |
| ACP checkout                             | **No** (opt-in `CLAWQL_ACP_ENABLED`; default off; dry-run for demos)     | Fix before any live merchant SPT                       |
| ACH credit top-up                        | **No** on managed waitlist; self-host only when credits + Stripe key set | Live path now requires `correlationId` for durable key |
| Platform Stripe Checkout / subscriptions | Separate path (webhook-idempotent)                                       | Not the ACP/ACH write-ahead gap                        |

**Queue:** resume consume security (#1459) first; Stripe write-ahead next; then celld.
If ACP/ACH ever charge live customers before this lands, reorder Stripe ahead of celld
immediately — double-charge risk is live then.

## Formalization order (agreed)

1. **Payments cluster** — Stripe write-ahead (this change +
   `PaymentsStripeIdempotency`); holds/compensation TLA + explicit transitions
   (parallel PR #1458); next: money requests, ACP status graph.
2. **celld lease / supersede** — vendored `vendor/celld-lab` on PR #1456 (not on
   `main`); invariant: two live owners never both send.
3. **Security machines** — OAuth/PKCE single-use+expiry+verifier; HTTP session
   IFC labels must only accumulate (never drop on reset/resume/reconnect).
4. **Account deletion** vs WORM retention.
5. **Program proposal** graph (half of program formalization).

Structural rule for every machine touched: one explicit `(state, event) → next |
IllegalTransition` function with exhaustive Effect matching, logged for TLC
conformance.
