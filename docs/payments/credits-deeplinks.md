# Credits deep links (HATEOAS / HTMX / QR) + mini UI

Shareable pay and money-request links for prepaid P2P — same addressing as `credits pay` / `credits request`, without moving money until stage → confirm.

Also hosts a **brand-first mini UI** at `/credits`: total balance, four verbs (Top up · Pay · Request · Activity), and a recent strip — X Money grammar, ClawQL voice (not a bank dashboard).

## URLs

| Kind            | Shape                                                            |
| --------------- | ---------------------------------------------------------------- |
| Mini home       | `{base}/credits` or `{base}/credits/ui` (`?tenant=`)             |
| Top up          | `{base}/credits/topup?tenant=`                                   |
| Pay compose     | `{base}/credits/pay?tenant=` (no `to`)                           |
| Pay landing     | `{base}/credits/pay?to=@bob&amount=10&note=coffee`               |
| Pay (scheme)    | `clawql://pay?to=@bob&amount=10`                                 |
| Request compose | `{base}/credits/request/new?tenant=`                             |
| Request         | `{base}/credits/request/{requestId}`                             |
| Activity        | `{base}/credits/activity?tenant=`                                |
| Invite          | `{base}/credits/request/invite?request_id=…&token=…`             |
| QR SVG          | `{base}/credits/qr.svg?to=…&amount=…` (encodes `clawql://pay?…`) |

`base` comes from **`CLAWQL_CREDITS_HATEOAS_BASE`**, else `CLAWQL_COMPENSATION_APPROVAL_BASE` / gateway URL, else `clawql://tool` (same fallback as compensation approval links).

## Gateway routes

When the MCP HTTP server is up, these are mounted under `/credits/*`:

- **GET** `/credits` · `/credits/ui` — home: Total balance + Top up / Pay / Request / Activity + recent
- **GET** `/credits/topup` — ACH top-up CLI hints
- **GET** `/credits/pay` — without `to`: pay compose; with `to`: pay landing + QR (Accept: HTML or JSON HATEOAS)
- **POST** `/credits/pay/stage` — HTMX stage from pay landing (`from` + `to` + `amount`) → magic-link fragment
- **GET** `/credits/qr.svg` — payment QR
- **GET** `/credits/transfer/approve` — magic-link review (GET-safe; `?action_id=&code=`)
- **POST** `/credits/transfer/confirm` — authorize staged transfer (optional TOTP when gated)
- **GET** `/credits/transfer/cancel` — cancel staged transfer (GET-safe)
- **GET** `/credits/request/new` — request compose (copies CLI)
- **GET** `/credits/activity` — full recent list for `?tenant=`
- **GET** `/credits/request/invite` — claim form (token-gated)
- **POST** `/credits/request/invite/claim` — HTMX claim
- **GET** `/credits/request/:id` — status + accept/decline forms
- **POST** `…/accept` — stages transfer; returns magic-link CTA (still needs authorize/confirm)
- **POST** `…/decline`

Put these behind gateway auth in production. **Accept / Stage** only stage — money moves on **magic-link authorize** (POST confirm) or CLI `transfer --confirm` (+ optional TOTP).

### Mini UI notes

- Grammar mirrors consumer P2P home: **balance → verbs → activity** (no debit/APY/card tiles)
- Brand (**ClawQL**) leads the shell; amount is the primary number; QR is the visual plane on pay landing
- After HTMX stage/accept: **Authorize with magic link** opens GET-safe review, then POST confirm
- Possession of `action_id` + `code` is the capability; when `CLAWQL_CREDITS_TRANSFER_REQUIRE_TOTP=1`, the approve form also requires TOTP
- Motion: rise-in sections + amount scale-in (respects `prefers-reduced-motion`)

## CLI

```bash
export CLAWQL_CREDITS_HATEOAS_BASE=https://gateway.example

clawql payments credits link --to @bob --amount 10 --note coffee
clawql payments credits link --request-id UUID
clawql payments credits link --parse 'clawql://pay?to=@bob&amount=10'
clawql payments credits qr --to bob@acme.com --amount 5 --out pay.svg
```

## MCP

`payments_credits_link` when `CLAWQL_PAYMENTS_MCP_TOOLS=1` — returns HATEOAS envelope; optional `includeQrSvg`.

## Env

| Variable                      | Default                          | Meaning                                   |
| ----------------------------- | -------------------------------- | ----------------------------------------- |
| `CLAWQL_CREDITS_HATEOAS_BASE` | (compensation / `clawql://tool`) | Public origin for pay/request/invite URLs |

See also: [contacts & phone](./credits-contacts.md), [money requests](./money-requests.md), [activity feed](./activity-feed.md), [consumer roadmap](./p2p-consumer-roadmap.md).
