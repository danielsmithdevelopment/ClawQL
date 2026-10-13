# Mobile store subscriptions (App Store / Play) — v0.1

**Status:** Spec v0.1 (design / north star)  
**Surfaces:** `apps/mobile` · `packages/clawql-payments` · App Store Connect / Play Console  
**Related:** [self-serve-stripe-checkout-v0.1](./self-serve-stripe-checkout-v0.1.md) · [hybrid-billing-v0.1](./hybrid-billing-v0.1.md) · [customer-provisioning-core-v0.1](./customer-provisioning-core-v0.1.md) · [`apps/mobile/LOCAL.md`](../../../apps/mobile/LOCAL.md)

## Goal

People can **sign up and pay for ClawQL from the phone** using the normal store purchase sheet (Apple Pay / Google Pay as the wallet UX), and over time do **nearly everything in-app** without opening the web console.

## Naming (important)

| User says | What we implement |
| --------- | ----------------- |
| “Apple Pay in the App Store” | **App Store In-App Purchase** (StoreKit 2) — subscriptions that unlock digital features |
| “Android Pay / Play” | **Google Play Billing** — same role on Android |
| Stripe Checkout | **Web / console** self-serve (already shipping) |

Apple and Google require IAP for digital subscriptions sold inside the app. Embedding Stripe Checkout (or a raw Apple Pay → Stripe charge) to unlock the same cloud plan **inside iOS** is not the compliant path. Keep Stripe for www + console; keep IAP for the native paywall.

## Current state

| Rail | Status |
| ---- | ------ |
| Stripe Checkout → `provisionOrg` | Spec + `clawql-payments` (web) |
| Hybrid subscription + credits | Spec |
| PhoneApprove approve / inbox / prefs | Shipped on phone (fixture → live APIs next) |
| Mobile billing / team / gateways | Explicitly “open web console” today |
| StoreKit / Play Billing | **Not started** |

## Entitlement model (Phase 1)

One org plan; two settlement rails:

```text
clawql_billing_mode = stripe_checkout | hybrid | credits_only | store_iap | dual
```

- **`store_iap`:** org provisioned / renewed from a verified App Store or Play purchase.
- **`dual`:** web Stripe customer **or** store subscription can grant the same `ClawqlPlanId` entitlements; server is source of truth; mobile restores purchases on launch.
- Receipt / Play purchase token verification runs **server-side** (Effect service in `clawql-payments`), then calls the same `provisionOrg` / plan update path as Stripe webhooks.
- Never trust the client alone for “Pro unlocked.”

## Store catalog (Phase 2)

Mirror web plans that are self-serve today:

| Plan | Store product (sketch) | Notes |
| ---- | ---------------------- | ----- |
| Pro | `clawql_pro_monthly` / `clawql_pro_annual` | Auto-renewable subscription |
| Team | `clawql_team_monthly` / `clawql_team_annual` | Seat rules still server-enforced |
| Free | — | No IAP; fixture / trial gates |
| Enterprise | — | Stay invoice / Stripe sales; no public IAP |

Sandbox: StoreKit Configuration / Play license testers before production SKUs.

## In-app UX (Phase 3)

1. **Sign up** — create auth subject + org shell (or attach to existing SSO later).
2. **Paywall** — present store subscription sheet (`react-native-iap` or RevenueCat; pick one adapter behind Effect).
3. **Restore** — Profile → Restore purchases.
4. **Manage** — deep link to Apple / Google subscription management; show plan + renewal status in-app (read from our entitlements API).
5. **Honesty** — fixture mode: “Subscribe (sandbox)” that flips fixture entitlements without StoreKit.

## Full-app depth (Phase 4+)

Bring console work onto the phone **where a phone is the right surface**:

| Keep / deepen in-app | Stay web-first |
| -------------------- | -------------- |
| Review / approve / ask teammate | Heavy gateway / MCP mesh admin |
| Inbox, digest, activity | Complex audit explorers |
| Spend + plan status + store manage | Enterprise invoice ops |
| Teammate invite + approval groups | Full policy DSL editors (start with common edits) |
| Security keys list + enroll guidance | Rare break-glass tools |

North star copy replaces Profile’s “Gateways, billing, and team live in the web console” with in-app destinations as each surface lands.

## Out of scope for v0.1 implementation

- Shipping production IAP without Apple / Google enrollment ([Day-0 checklist](../../../apps/mobile/store/DAY0-CHECKLIST.md))
- Replacing Stripe web checkout
- Metered overage via store consumables (prefer credits / Stripe meter on web rail)
- Physical Apple Pay for non-digital goods

## Suggested build order

1. **Entitlements API** — `GET /billing/entitlements` + `billingMode` including `store_iap` / `dual`; fixture plan switch.
2. **Verify endpoint** — `POST /billing/store/verify` (Apple JWS / Play purchase token) → provision / renew.
3. **Mobile paywall shell** — Profile + blocked-feature gate; fixture subscribe first.
4. **Wire StoreKit / Play** behind the same shell once Day-0 accounts exist.
5. **Expand in-app admin** surface-by-surface (team → policies → keys → billing status).

## Acceptance (when Phase 3 is done)

- [ ] New user can create an account on phone and complete a **sandbox** Pro subscribe without Safari Checkout.
- [ ] Server entitlements show Pro; Review and spend gates unlock.
- [ ] Restore purchases re-links the same org plan after reinstall.
- [ ] Web Stripe org and store-IAP org both appear as first-class plans in customer dashboard.
- [ ] App Review notes document sandbox / reviewer subscribe path.
