# clawql-auth

Gateway authentication (`noAuth`, `apiKey`) with ATR-shaped claims, plus upstream provider credential resolution for `execute`.

## Environment

| Variable | Purpose |
| -------- | ------- |
| `CLAWQL_AUTH_MODE` | `noAuth` (default) or `apiKey` |
| `CLAWQL_API_KEY` | Required when mode is `apiKey` |
| `CLAWQL_PROVIDER_AUTH_JSON` | Per-provider upstream headers (see provider-auth-headers) |

## Phase 1

Ships **noAuth** and **apiKey** gateway modes. OIDC/SAML/RBAC package expansion is post–Phase 1.
