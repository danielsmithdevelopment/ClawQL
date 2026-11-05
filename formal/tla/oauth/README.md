# OAuth authorization_code + PKCE (TLA+)

`OauthPkceAuthCode.tla` — inbound MCP OAuth one-time auth codes with S256 PKCE.

| Config                      | `WeakNoConsume`     | Expect                                              |
| --------------------------- | ------------------- | --------------------------------------------------- |
| `OauthPkceAuthCode.cfg`     | `FALSE` (target)    | **PASS** — delete-on-read; ≤1 token                 |
| `OauthPkceAuthCodeWeak.cfg` | `TRUE` (historical) | **COUNTEREXAMPLE** — peek without delete → 2 tokens |

```bash
scripts/formal/run-oauth-pkce-tlc.sh
```

## Mapping

| Spec                                  | Code                                                     |
| ------------------------------------- | -------------------------------------------------------- |
| `Issue`                               | `McpOAuthService` authorize → `authCodeStore.save`       |
| `ExchangeSuccess`                     | `exchangeAuthorizationCode` after `consume` + PKCE match |
| `ExchangeWrongVerifier`               | consume then `pkce_failed` (code still gone)             |
| `ExchangeExpired` / `ExchangeMissing` | `invalid_grant`                                          |
| `WeakExchangeSuccess`                 | non-atomic peek (counterexample oracle)                  |

Store: `packages/clawql-auth/src/inbound/mcp-auth-code-store.ts`  
Exchange: `packages/clawql-auth/src/inbound/mcp-oauth.ts`

---

# OAuth device authorization (RFC 8628)

`OauthDeviceAuthorization.tla` — MCP OAuth device_code + user_code grant.

| Config | `WeakNoDelete` | Expect |
| ------ | -------------- | ------ |
| `OauthDeviceAuthorization.cfg` | `FALSE` (target) | **PASS** — delete-on-read consume; ≤1 |
| `OauthDeviceAuthorizationWeak.cfg` | `TRUE` | **COUNTEREXAMPLE** — peek without delete |

```bash
scripts/formal/run-oauth-device-tlc.sh
```

## Mapping

| Spec | Code |
| ---- | ---- |
| `Issue` | `createDeviceAuthorizationEffect` / `store.save` |
| `Approve` | `store.approve` via `transitionDeviceFlow` |
| `Consume` | `store.consumeApproved` (delete-on-read) |
| `Expire` | TTL check before approve/consume |
| `WeakConsumeNoDelete` | non-atomic peek (counterexample oracle) |

Code: `packages/clawql-auth/src/inbound/mcp-device-flow-transition.ts` +
`mcp-device-flow.ts`.

## Related

Session IFC label monotonicity is covered by Lean
[`formal/lean/InformationFlow.lean`](../../lean/InformationFlow.lean)
(`labels_only_grow`) + TS differential tests — not duplicated here.
