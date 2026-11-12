# Data-handling page draft (`clawql.com/data-handling`)

**Status:** Draft for marketing site + privacy-policy reconciliation. Prepared 2026-11-11. Live route: [`apps/www/src/app/data-handling/page.tsx`](../../apps/www/src/app/data-handling/page.tsx). **Not legal advice — counsel review before publishing.**

**Related:** [`/privacy-policy`](https://clawql.com/privacy-policy) · [`/security`](https://clawql.com/security) · [`/cloud`](https://clawql.com/cloud) · [`TELEMETRY.md`](../../TELEMETRY.md) · [`SECURITY.md`](../../SECURITY.md) · [`security.txt`](../../apps/www/public/.well-known/security.txt).

---

# How we handle your data

**What ClawQL sees, where it lives, how long we keep it, and how it's deleted, in plain language.** The privacy policy is the legal version; this page is the practical one.

## If you self-host

ClawQL running on your own infrastructure sends us nothing by default. Documented in [`TELEMETRY.md`](../../TELEMETRY.md): no phone-home usage reporter; never includes the content of tool calls, documents, memory or credentials.

## If you use managed hosting

| Data | What it is | Where it lives | How long |
| --- | --- | --- | --- |
| Account | Name, email, company, billing details (cards via Stripe) | Managed region TBD (planned AWS); EU on Enterprise | Life of account + legal holds |
| Credentials | Vault API keys/tokens | Encrypted vault; injected at gateway | Until removed or account closed |
| Tool-call content | Gateway requests/responses | In transit; redacted/projected | Audit + configured caches only |
| Memory and documents | Ingest + IDP docs | Tenant storage / tenant key on paid | Until deleted |
| Audit trail | Decisions, approvals, actions | Hash-chained; write-once where configured | Retention TBD + key destruction |
| Telemetry | Ops metrics/logs | Tenant storage on paid; logical on free/trial | Tier windows (short on free/trial) |

## What we will never do

- Train models on customer content (no such program today; future would need explicit opt-in)
- Sell data or use it for advertising
- Hold model-provider consumer-subscription credentials

## Deletion vs write-once

Disable key → schedule destruction → delete storage; each step recorded. Write-once audit entries may remain for a retention window but become unreadable after key destruction. **Counsel must confirm against deletion rights.**

## Service providers (verified 2026-11-11)

| Provider | Purpose | Verified |
| --- | --- | --- |
| Stripe | Payments | Pricing / privacy |
| AWS (planned) | Managed infra | Cloud platform plan — region TBD |
| FormSubmit | Waitlist forms → hello@clawql.com | `apps/www/src/lib/waitlist.ts` |
| ClawQL first-party analytics | Optional pageviews | `ClawqlAnalyticsPageview` |
| Transactional email | TBD before GA | — |

## Contacts

- Privacy: privacy@clawql.com
- Security: daniel@clawql.com (`SECURITY.md` / `security.txt`)
- General: hello@clawql.com

---

## Privacy policy reconciliation checklist

### Conflicts with how the platform works

- [x] Deletion vs write-once audit — stated; counsel confirm
- [x] Tool-call / memory / docs / audit / telemetry categories listed
- [x] Provider-network credits future closed-loop note

### Missing disclosures

- [x] Legal entity — Delaware incorporation pending; postal TBD
- [x] Model training prohibition
- [x] Service providers named / TBD called out
- [x] Analytics and cookies (first-party pageview + localStorage session id)
- [x] Data location / transfers — region TBD; EU Enterprise; SCCs TBD counsel
- [x] Retention by category (exact audit window TBD counsel)
- [x] Processor vs controller roles; DPA/BAA pointer
- [x] California do-not-sell/share; GDPR bases draft
- [x] Children's privacy; breach notification
- [x] Separate privacy / security contacts + security.txt

### Consistency

- [x] Footer / waitlist Apache wording — packages in this repository (not “full stack”)

## Notes for publishing

- [x] Bracketed items filled with verified values or explicit TBD
- [x] Self-host telemetry verified via new root `TELEMETRY.md`
- [ ] Counsel review deletion + training commitments before GA
- [x] Cross-link privacy, security, cloud
