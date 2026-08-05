# Consumer P2P path (Venmo / Cash App simplicity)

**Goal:** Make prepaid credit transfers feel as simple as `pay @bob $10`, while keeping ClawQL’s stage/confirm + optional TOTP security model.

ClawQL is **not** a consumer bank. Balances are prepaid credits; bank/USDC off-ramp stays on existing payout rails. The product bet is **agent-native + human-simple** addressing and flows.

## Shipped (bit by bit)

| Bit | Status | Notes |
| --- | ------ | ----- |
| Prepaid ledger + ACH top-up | ✅ | [`credits-ach.md`](./credits-ach.md) |
| Tenant ↔ tenant transfer | ✅ | Dual-lock ledger; WORM `peer_transfer` |
| Stage → confirm (+ optional TOTP) | ✅ | High-impact 2PC |
| Pay-by-email (default) + optional `@username` | ✅ | `$CLAWQL_HOME/Payments/directory.json` |
| `credits pay --to email\|@user` | ✅ | Alias over transfer + directory resolve |
| OIDC / MFA policy (gateway) | ✅ (stacked) | [`clawql-auth-oidc-stepup.md`](../security/clawql-auth-oidc-stepup.md) |

## Addressing model

| Identity | Role |
| -------- | ---- |
| **Email** | Default payee (like Venmo / Cash App). Claim with `--email`. |
| **`@username`** | Optional privacy alias — payers who know `@alice` never see the email. |
| **Tenant id** | Escape hatch for agents / ops (`--to-tenant`). |

Emails are stored only under `$CLAWQL_HOME/Payments/directory.json` (mode `0600`) — **never** in payment WORM. CLI `directory list` masks emails unless `--show-secrets`.

## Next bits (suggested order)

1. **Request money** — inert request record `@alice` asks `@bob` for $X; bob confirms → same transfer path
2. **Activity feed** — recent sent/received/requests for a handle (read model over ledger + directory)
3. **QR / deep link** — `clawql://pay/@bob?amount=10` for mobile / agent handoff
4. **Contacts** — optional phone/email → handle (customer IdP or verified claim; not a full IdP)
5. **Hosted mini UI** — one-screen pay/request (brand-first; not a dashboard)

## Explicit non-goals (for now)

- Competing on consumer banking licenses, debit cards, or cash deposits
- Public social feed / discovery graph (privacy-first by default)
- Replacing Stripe Connect / USDC rails with a new money movement network

## Try it

```bash
export CLAWQL_CREDITS_ENABLED=1
# Default: pay-by-email
clawql payments credits directory claim --email alice@acme.com --tenant-id alice --name Alice
clawql payments credits directory claim --email bob@acme.com --tenant-id bob
# Optional privacy usernames
clawql payments credits directory claim --tenant-id alice --handle alice
clawql payments credits directory claim --tenant-id bob --handle bob
# fund alice ledger, then:
clawql payments credits pay --from-tenant alice --to bob@acme.com --amount 5 --note coffee
# or, if bob claimed @bob:
clawql payments credits pay --from-tenant alice --to @bob --amount 5
clawql payments credits transfer --confirm --action-id … --code …
```
