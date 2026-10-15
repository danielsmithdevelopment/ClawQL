# PhoneApprove App Review / v1 safety — decisions

**Status:** Settled for first store submission  
**Date:** 2026-10-15  
**Branch:** `cursor/app-review-v1-safety-f8cd`  
**Related:** [console-parity-v0.1](./console-parity-v0.1.md) · [mobile-store-iap-v0.1](../billing/mobile-store-iap-v0.1.md) · Apple [Guideline 3.1](https://developer.apple.com/app-store/review/guidelines/#payments) · [`store/review-notes.md`](../../../apps/mobile/store/review-notes.md)

## Context

Full console parity shipped more surface area than a minimal v1. Before App Store / Play submission, settle billing, fixture honesty, offline/notification privacy, API-key clipboard, and which surfaces stay read-only.

## Decision 1 — Billing: sell nothing in the app (v1)

**Choose:** Plan status is **read-only** on PhoneApprove. Do **not** present in-app purchase subscribe CTAs, Stripe portal CTAs, prices, upgrades, or “where to pay” copy in production store builds — including empty states and plan screens. Sign-up / sign-in may create accounts; they must not lead toward payment.

**Why (Apple 3.1, verified 2026-10-15 against current App Review Guidelines):**

- **3.1.1** — Digital features unlocked in the app generally require IAP; steering to external payment is restricted. US storefront CTAs are looser after the May 2025 update; other regions have not fully followed.
- **3.1.3(a) Reader** — Narrow content types (magazines, books, audio, video, etc.). A B2B approval client is a poor reader fit.
- **3.1.3(b) Multiplatform** — Access to web-purchased entitlements is allowed **if** the same items are also offered as IAP in-app. That forces a dual catalog we are not ready to support for v1.
- **3.1.3(c) Enterprise Services** — Org-sold B2B tools may let enterprise users access previously purchased subscriptions without IAP (consumer/family sales still need IAP). Matches ClawQL’s org-pays model.
- **3.1.3(f) Free Stand-alone Apps** — A free companion to a paid web tool needs **no purchasing inside the app and no calls to action for purchase outside the app**. Cleanest v1 posture.

**Demo / Maestro:** Fixture builds (`EXPO_PUBLIC_CLAWQL_FIXTURE=1`) may still show sandbox subscribe for MOB-* flows.

**North star:** Later IAP (StoreKit / Play) remains a post–Day-0 option; it is **not** the v1 submission posture.

## Decision 2 — Fixtures never silently appear in production

- Fixture / sample payloads only when `fixtureMode` **or** an explicit `reviewerDemo` session (`allowsDemoData`).
- Reviewer demo must be **labeled** in UI (“Reviewer demo · sample data”).
- Production live sessions: **empty states** on API failure — never promote fixture catalogs as real org data (including Memory list, Team, Gateway, Automations, Audit, Settings).

## Decision 3 — Offline cache, approve-online, lock-screen notifications

- Offline snapshot is **AES-GCM encrypted**; key in `expo-secure-store` (`WHEN_UNLOCKED_THIS_DEVICE_ONLY` on iOS).
- Blob lives under the app **Caches** directory (not backed up) and is marked `isExcludedFromBackup` via the secure-clipboard native module.
- Legacy AsyncStorage blobs are deleted on read/write — never re-promoted.
- Cache cleared on **sign-out**.
- Cache is **browse-only**. Approving requires a live round-trip so mandate digest binding can reject a stale screen — offline banners say this explicitly.
- Push / local notification **content is always generic** on the lock screen (“A change needs your review”).

## Decision 4 — API key secret clipboard

- Native Expo module `clawql-secure-clipboard`:
  - **iOS:** `UIPasteboard.setItems` with `.localOnly` + `.expirationDate` (no Universal Clipboard sync).
  - **Android:** sensitive clip extras + TTL clear.
- Without the native bridge (web / unrebuilt Expo Go): **do not auto-copy** — show the secret for manual selection only.
- Avoid `Share.share` for secrets.

## Decision 5 — v1 read-only ops surfaces

Keep screens reachable for parity, but mark **Gateway**, **Automations**, and **Settings** as **read-only in v1** (browse; mutations stay on web).

## Day-0 / review path

1. **Start App Store enrollment now** (longest wait).
2. Development / preview build on hardware — run [`HARDWARE-VERIFY.md`](../../../apps/mobile/store/HARDWARE-VERIFY.md) (Universal Clipboard + Android sensitive clip).
3. Export compliance: `ITSAppUsesNonExemptEncryption=false` + [`export-compliance.md`](../../../apps/mobile/store/export-compliance.md) (“uses encryption, exempt” — never “no”).
4. Privacy: module `PrivacyInfo.xcprivacy` + App Privacy labels in [`apple-privacy-labels.md`](../../../apps/mobile/store/privacy/apple-privacy-labels.md).
5. TestFlight with the **reviewer demo** account; submit with [`review-notes.md`](../../../apps/mobile/store/review-notes.md).

Physical NFC, live IAP secrets, and real IdP/Stripe remain human Day-0 items.
