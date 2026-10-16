# IdP login abuse ownership

**Status:** Operator ownership matrix — 2026-10-15

ClawQL is **not** a human password IdP for the managed console. Login throttling and account lockout for humans are owned by the identity provider. ClawQL rate-limits **MCP OAuth / API** surfaces.

## Matrix

| Surface | Who owns rate limit / lockout | ClawQL control |
|---------|------------------------------|----------------|
| Cloud console / clawql.com human login (Supabase Auth) | **Supabase project** (Auth rate limits, email OTP, CAPTCHA) | Configure in Supabase dashboard; document in runbook |
| Enterprise SSO (Okta / Entra / Keycloak) | **Customer IdP** policies | Org SSO domain + SCIM offboard → key revoke |
| MCP OAuth authorize / token | **ClawQL** | `CLAWQL_MCP_OAUTH_RATE_LIMIT_PER_MIN` (default 120) in `packages/clawql-auth/src/inbound/oauth-rate-limit.ts` |
| Stripe / webhook ingress | **ClawQL** | Per-route limiters on MCP HTTP |
| PhoneApprove mobile sign-in | Same as console IdP | Mobile does not implement a parallel password store |

## Operator checklist (before production)

1. Enable Supabase Auth rate limits / CAPTCHA if password or magic-link is offered.
2. For SSO-only orgs, disable password signup and require IdP MFA.
3. Confirm SCIM offboard revokes API keys (`packages/clawql-auth` offboard).
4. Set MCP OAuth rate limit appropriate to traffic; monitor 429s.
5. Never set `CLAWQL_ALLOW_NO_ENFORCEMENT=1` to “fix” login issues — unrelated.

## Related

- Supabase managed signup: `docs/specs/auth/supabase-managed-signup-v0.1.md`
- OIDC step-up out-of-scope note: `docs/security/clawql-auth-oidc-stepup.md`
- Support impersonation (admin view-as, not password login): `docs/security/support-impersonation.md`
