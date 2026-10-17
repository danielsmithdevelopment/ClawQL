# HTTP security headers (MCP + dashboard)

Baseline **CSP / HSTS / framing / MIME sniffing** controls for ClawQL HTTP surfaces. This is engineering hardening for SOC 2 Type II evidence (CC6 / confidentiality), not a certification claim.

## Surfaces

| Surface                         | Where                                                                                    | Default CSP posture                                 |
| ------------------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------- |
| **MCP HTTP** (Express)          | `src/http/security-headers.ts` via `applySecurityHeadersMiddleware` on `mcp-http-server` | `default-src 'none'` (JSON/API; no scripts)         |
| **Managed dashboard** (Next.js) | `apps/dashboard/next.config.mjs` `headers()`                                             | `default-src 'self'` + Next-compatible script/style |
| **Marketing www**               | `apps/www/functions/_middleware.ts`                                                      | Thin set (nosniff + referrer); expand separately    |

## Environment

| Variable                  | Default | Meaning                                                                      |
| ------------------------- | ------- | ---------------------------------------------------------------------------- |
| `CLAWQL_SECURITY_HEADERS` | on      | Set `0` / `false` / `off` to disable header injection (local debugging only) |
| `CLAWQL_HSTS`             | off     | Set `1` only behind TLS terminators that own HTTPS for the hostname          |

HSTS is **opt-in** so plain-HTTP Cloud Agent / localhost dev is not bricked. Production Helm / edge should set `CLAWQL_HSTS=1` (see `manifests/charts/clawql-mcp/values-soc2-hardening.example.yaml` when packaging lands).

## Managed API IDOR companion

Client-supplied `orgId` on managed console routes must match the **trusted** session / `CLAWQL_MANAGED_ORG_ID` value. Spoofs return **403**. Key revoke additionally checks the stored key’s `orgId` before mutation (`apps/dashboard/src/lib/managed/org-scope.ts`, `live/keys.ts`).

Regression: Vitest in `org-scope.test.ts` and `keys.test.ts` (“cross-org revoke”). E2E SEC-05 still covers fixture harness cross-tenant 404s.

## Verification

```bash
# MCP builder unit tests
npx vitest run src/http/security-headers.test.ts

# Dashboard org-scope + revoke IDOR
cd apps/dashboard && npx vitest run src/lib/managed/org-scope.test.ts src/lib/managed/live/keys.test.ts
```

Against a running MCP HTTP process with headers enabled, expect `Content-Security-Policy`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, and (when `CLAWQL_HSTS=1`) `Strict-Transport-Security`.
