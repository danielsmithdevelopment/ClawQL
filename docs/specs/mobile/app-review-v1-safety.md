# PhoneApprove App Review / v1 safety — decisions

**Status:** Settled for first store submission  
**Date:** 2026-10-15  
**Branch:** `cursor/app-review-v1-safety-f8cd`  
**Related:** [console-parity-v0.1](./console-parity-v0.1.md) · [mobile-store-iap-v0.1](../billing/mobile-store-iap-v0.1.md) · Apple [Guideline 3.1](https://developer.apple.com/app-store/review/guidelines/#payments)

## Context

Full console parity shipped more surface area than a minimal v1. Before App Store / Play submission, settle billing, fixture honesty, offline/notification privacy, API-key clipboard, and which surfaces stay read-only.

## Decision 1 — Billing: sell nothing in the app (v1)

**Choose:** Plan status is **read-only** on PhoneApprove. Org billing stays on the **web** console (Stripe). Do **not** present in-app purchase subscribe CTAs or Stripe portal CTAs in production store builds.

**Why (Apple 3.1, verified 2026-10-15 against current App Review Guidelines):**

- **3.1.1** — Digital features unlocked in the app generally require IAP; steering to external payment is restricted. US storefront CTAs are looser after the May 2025 update; other regions have not fully followed.
- **3.1.3(a) Reader** — Narrow content types (magazines, books, audio, video, etc.). A B2B approval client is a poor reader fit.
- **3.1.3(b) Multiplatform** — Access to web-purchased entitlements is allowed **if** the same items are also offered as IAP in-app. That forces a dual catalog we are not ready to support for v1.
- **3.1.3(c) Enterprise Services** — Org-sold B2B tools may let enterprise users access previously purchased subscriptions without IAP (consumer/family sales still need IAP). Matches ClawQL’s org-pays model.
- **3.1.3(f) Free Stand-alone Apps** — A free companion to a paid web tool needs **no purchasing inside the app and no calls to action for purchase outside the app**. This is the cleanest v1 posture: show plan read-only; manage billing only on the web.

**Demo / Maestro:** Fixture builds (`EXPO_PUBLIC_CLAWQL_FIXTURE=1`) may still show sandbox subscribe for MOB-* flows.

**North star:** Later IAP (StoreKit / Play) remains a post–Day-0 option; it is **not** the v1 submission posture. See store-iap spec — v1 supersedes “pay from the phone” for the first binary.

## Decision 2 — Fixtures never silently appear in production

- Fixture / sample payloads only when `fixtureMode` **or** an explicit `reviewerDemo` session (`allowsDemoData`).
- Reviewer demo must be **labeled** in UI (“Reviewer demo · sample data”).
- Production live sessions: **empty states** on API failure — never promote fixture catalogs as real org data (including Memory list, Team, Gateway, Automations, Audit, Settings).

## Decision 3 — Offline cache, approve-online, lock-screen notifications

- Offline snapshot is **AES-GCM encrypted**; key in `expo-secure-store` (`WHEN_UNLOCKED_THIS_DEVICE_ONLY` on iOS). Legacy plaintext v1 blobs are deleted on read.
- Cache cleared on **sign-out**.
- Cache is **browse-only**. Approving requires a live round-trip so mandate digest binding can reject a stale screen — offline banners say this explicitly.
- Push / local notification **content is always generic** on the lock screen (“A change needs your review”) — no contract titles or amounts until unlock. Detail stays in the notification `data` payload / in-app inbox only.

## Decision 4 — API key secret clipboard

- Prefer native `UIPasteboard` **localOnly + expirationDate** when a bridge is installed (`__CLAWQL_SECURE_CLIPBOARD__`).
- Fallback: `expo-clipboard` + **auto-clear after 60s** when the pasteboard still matches what we wrote (expo-clipboard 57 does not expose localOnly yet).
- Avoid `Share.share` for secrets (spreads the secret into the share sheet / other apps).

## Decision 5 — v1 read-only ops surfaces

Keep screens reachable for parity, but mark **Gateway**, **Automations**, and **Settings** as **read-only in v1** (browse; mutations stay on web). Shrinks review/maintain risk without deleting routes.

## Day-0 reminder

App Store enrollment still has the longest waiting period — start that first if not already underway. Physical NFC, live IAP secrets, and real IdP/Stripe remain human Day-0 items.
