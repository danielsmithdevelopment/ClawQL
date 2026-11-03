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
- Resume gap: when `approvedExecutionId` is present, `gateNativeToolBeforeInvoke`
  returns allow **without** `tryConsumeApprovedMandate`
  (`packages/clawql-api/src/governance/native-tool-gate.ts`).
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
4. Stripe PaymentIntent / webhook idempotency for cash rails; ACP skips re-charge
   when session is already `completed`.

## Formalization order (agreed)

1. **Payments cluster** (this doc + `formal/tla/payments`) — holds, compensation;
   next: money requests, ACP.
2. **celld lease / supersede** — vendored `vendor/celld-lab` on PR #1456 (not on
   `main`); invariant: two live owners never both send.
3. **Security machines** — OAuth/PKCE single-use+expiry+verifier; HTTP session
   IFC labels must only accumulate (never drop on reset/resume/reconnect).
4. **Account deletion** vs WORM retention.
5. **Program proposal** graph (half of program formalization).

Structural rule for every machine touched: one explicit `(state, event) → next |
IllegalTransition` function with exhaustive Effect matching, logged for TLC
conformance.
