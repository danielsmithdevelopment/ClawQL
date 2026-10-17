# Email `+` (plus-address) normalization

**Audience:** Auth / payments identity  
**Code:** `packages/clawql-auth` (`normalizeEmailIdentityEffect`) · payments directory opt-in  
**Status:** 2026-10-17

## Ownership

| Surface                                                                | Owner                                                                          | Plus-tag policy                                                                           |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| Human **login / signup / password reset**                              | **Customer IdP** (Supabase Auth, Okta, …) — ClawQL does not issue login tokens | Configure in IdP (often “treat aliases as same user” or reject). **Out of ClawQL scope.** |
| ClawQL-owned **email keys** (payments directory claim, invite routing) | **ClawQL**                                                                     | Opt-in strip of `+tag` before `@` via `CLAWQL_EMAIL_PLUS_NORMALIZE=1`                     |

This closes the prod-readiness “email+ if first-party signup” item **honestly**: first-party human signup stays IdP-owned; ClawQL only normalizes emails it stores as **directory / billing keys**.

## Opt-in behavior

When `CLAWQL_EMAIL_PLUS_NORMALIZE=1` (or `true` / `yes`):

- `user+news@example.com` → `user@example.com` (after trim + lowercase)
- Does **not** rewrite dots or domain-specific Gmail rules beyond `+` stripping
- Off by default so existing `+` claims keep working until operators migrate

## Operator notes

1. Enable only after scanning `directory.json` / Postgres for intentional `+` addresses you want to keep distinct.
2. IdP still decides whether `user+x@` can **sign in**; this flag only affects ClawQL key equality.
3. Prefer IdP “unique email” settings for abuse prevention at login; use this flag for ledger / payee collision resistance.

## Related

- [`clawql-auth-oidc-stepup.md`](./clawql-auth-oidc-stepup.md) — ClawQL is not an IdP
- Payments directory: `packages/clawql-payments/src/credits/directory.ts`
