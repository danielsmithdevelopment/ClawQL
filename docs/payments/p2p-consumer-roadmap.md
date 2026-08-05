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
| Request / invoice + email invite | ✅ | [`money-requests.md`](./money-requests.md) |
| Activity feed | ✅ | [`activity-feed.md`](./activity-feed.md) |
| QR / deep links (HATEOAS + HTMX) | ✅ | [`credits-deeplinks.md`](./credits-deeplinks.md) |
| Contacts + phone alias | ✅ | [`credits-contacts.md`](./credits-contacts.md) |
| Hosted mini UI | ✅ | `/credits` brand-first compose + pay landing — [`credits-deeplinks.md`](./credits-deeplinks.md) |
| OIDC / MFA policy (gateway) | ✅ (stacked) | [`clawql-auth-oidc-stepup.md`](../security/clawql-auth-oidc-stepup.md) |

## Addressing model

| Identity | Role |
| -------- | ---- |
| **Email** | Default payee (like Venmo / Cash App). Claim with `--email`. |
| **`@username`** | Optional privacy alias — payers who know `@alice` never see the email. |
| **Phone (E.164)** | Optional alias → tenant/email. Verified claim via customer IdP (`--verified`). |
| **Tenant id** | Escape hatch for agents / ops (`--to-tenant`). |
| **Contacts book** | Per-owner saved payees (`contacts.json`) — not a public graph. |

Emails and phones are stored only under `$CLAWQL_HOME/Payments/` (mode `0600`) — **never** in payment WORM. CLI list/mask unless `--show-secrets`.

## Next bits (suggested order)

1. ~~**Request money**~~ — ✅ email invoice + invite — [`money-requests.md`](./money-requests.md)
2. ~~**Activity feed**~~ — ✅ [`activity-feed.md`](./activity-feed.md)
3. ~~**QR / deep link**~~ — ✅ HATEOAS + HTMX + `clawql://pay` — [`credits-deeplinks.md`](./credits-deeplinks.md)
4. ~~**Contacts**~~ — ✅ phone alias + contacts book — [`credits-contacts.md`](./credits-contacts.md)
5. ~~**Hosted mini UI**~~ — ✅ brand-first `/credits` — [`credits-deeplinks.md`](./credits-deeplinks.md)
6. **Outbound email delivery** — optional later (invite URL print is enough for now)

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
# or, if bob claimed @bob / phone:
clawql payments credits pay --from-tenant alice --to @bob --amount 5
clawql payments credits directory claim --tenant-id bob --phone +15559876543 --verified
clawql payments credits pay --from-tenant alice --to +15559876543 --amount 5
clawql payments credits contacts add --to @bob --label Bob --tenant-id alice
clawql payments credits transfer --confirm --action-id … --code …
```
