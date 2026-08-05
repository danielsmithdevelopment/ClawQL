# Credits deep links (HATEOAS / HTMX / QR)

Shareable pay and money-request links for prepaid P2P — same addressing as `credits pay` / `credits request`, without moving money until stage → confirm.

## URLs

| Kind | Shape |
| ---- | ----- |
| Pay (HTTP) | `{base}/credits/pay?to=@bob&amount=10&note=coffee` |
| Pay (scheme) | `clawql://pay?to=@bob&amount=10` |
| Request | `{base}/credits/request/{requestId}` |
| Invite | `{base}/credits/request/invite?request_id=…&token=…` |
| QR SVG | `{base}/credits/qr.svg?to=…&amount=…` (encodes `clawql://pay?…`) |

`base` comes from **`CLAWQL_CREDITS_HATEOAS_BASE`**, else `CLAWQL_COMPENSATION_APPROVAL_BASE` / gateway URL, else `clawql://tool` (same fallback as compensation approval links).

## Gateway routes

When the MCP HTTP server is up, these are mounted under `/credits/*` with minimal HTMX pages:

- **GET** `/credits/pay` — landing + CLI hint + QR (Accept: HTML or JSON HATEOAS envelope)
- **GET** `/credits/qr.svg` — payment QR
- **GET** `/credits/request/invite` — claim form (token-gated)
- **POST** `/credits/request/invite/claim` — HTMX claim
- **GET** `/credits/request/:id` — status + accept/decline forms
- **POST** `…/accept` — stages transfer (still needs `transfer --confirm`)
- **POST** `…/decline`

Put these behind gateway auth in production; accept only **stages** — confirm (+ optional TOTP) remains the money-moving gate.

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

| Variable | Default | Meaning |
| -------- | ------- | ------- |
| `CLAWQL_CREDITS_HATEOAS_BASE` | (compensation / `clawql://tool`) | Public origin for pay/request/invite URLs |

See also: [money requests](./money-requests.md), [activity feed](./activity-feed.md), [consumer roadmap](./p2p-consumer-roadmap.md).
