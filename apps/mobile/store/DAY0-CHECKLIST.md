# Store Day-0 checklist (human + agent)

**Defer this entire list until you are ready to enroll.** Local fixture development does not need it — use [`../LOCAL.md`](../LOCAL.md) instead.

Complete before first TestFlight / Play internal upload. Items marked **agent** can be verified in-repo; **human** needs Apple/Google accounts.

## Accounts & identity

| # | Owner | Item | Done when |
| - | ----- | ---- | --------- |
| 1 | human | Apple Developer (Individual OK for v0.1) enrolled | Team ID known; replace `TEAMID` in `well-known/apple-app-site-association` |
| 2 | human | App Store Connect app created, bundle `com.clawql.app` | `ascAppId` pasted into `eas.json` → `submit.production.ios.ascAppId` |
| 3 | human | Google Play Console app created, package `com.clawql.app` | Internal testing track exists |
| 4 | human | EAS project linked | `eas init` → real `extra.eas.projectId` in `app.config.ts` (not the placeholder UUID) |

## Hosted assets (`cloud.clawql.com`)

| # | Owner | Item |
| - | ----- | ---- |
| 5 | human | Publish `well-known/apple-app-site-association` (no `.json` extension, `application/json`) |
| 6 | human | Publish `well-known/assetlinks.json` with Play signing cert SHA-256 |
| 7 | human | Privacy policy URL live (see `store/privacy/`) |
| 8 | human | Support URL live (e.g. `https://docs.clawql.com` or status page) |

## Builds

| # | Owner | Item | Command |
| - | ----- | ---- | ------- |
| 9 | agent/human | Preview / reviewer-demo / **development** build (needed for native clipboard module) | `npm run eas:reviewer` or EAS `development` profile |
| 10 | human | Production iOS → TestFlight | `npm run eas:ios && npm run eas:submit:ios` |
| 11 | human | Production Android → Play internal | `npm run eas:android-internal && npm run eas:submit:android` |

## Pre-TestFlight hardware + Connect

| # | Owner | Item | Done when |
| - | ----- | ---- | --------- |
| 9a | human | Clipboard hardware checks in [`HARDWARE-VERIFY.md`](./HARDWARE-VERIFY.md) | Secret does not Universal-Clipboard to Mac; expires ~60s; Android sensitive preview |
| 9b | agent | `ITSAppUsesNonExemptEncryption: false` in `app.config.ts` + [`export-compliance.md`](./export-compliance.md) | Connect skips per-build questionnaire; answer path is “uses encryption, exempt” |
| 9c | agent | `clawql-secure-clipboard` ships `PrivacyInfo.xcprivacy`; App Privacy labels match [`privacy/apple-privacy-labels.md`](./privacy/apple-privacy-labels.md) | Manifest has no undeclared Required Reason APIs; Photos listed for evidence attach |

## Reviewer package

| # | Owner | Item |
| - | ----- | ---- |
| 12 | human | Attach `store/review-notes.md` in App Review notes |
| 13 | human | Confirm Sign-in → **App Store reviewer demo** works on the uploaded build |
| 14 | agent | Maestro MOB-01…20 green on simulator/emulator before upload; `npm run a11y:lh` green on web export |

## Siri / App Intents (when you plug in native voice)

| # | Owner | Item | Done when |
| - | ----- | ---- | --------- |
| 19 | human | EAS / Xcode build with App Intents (Expo SDK 58 `expo-app-intents` or custom Swift) | “Hey Siri, list my ClawQL approvals” works on device |
| 20 | human | Mic + speech privacy strings live in App Store Connect privacy labels | Review notes match `NSMicrophoneUsageDescription` / speech recognition |
| 21 | agent | Wire App Intent handlers to `voice-assistant.ts` commands | Same grammar as `/voice` (list / read / decline / open) |

In-app typed + TTS voice assistant ships without this list (`docs/specs/mobile/voice-assistant-v0.1.md`).

## In-app subscriptions (when you plug in stores)

| # | Owner | Item | Done when |
| - | ----- | ---- | --------- |
| 15 | human | Create subscription group + SKUs from [`iap-catalog.json`](./iap-catalog.json) in App Store Connect | Product ids match catalog |
| 16 | human | Create matching Play Billing subscriptions | Same product ids (or documented mapping) |
| 17 | human | Paste Apple IAP / Play service-account secrets into managed hosting env | `POST /payments/store/verify` accepts live tokens (fixture path already works) |
| 18 | agent | Wire StoreKit / Play sheet behind `apps/mobile/src/services/store-iap.ts` | Profile Subscribe stops saying sandbox |

## Not blocking first internal track

- D-U-N-S / org Apple account (needed for company seller name later)
- Play production (needs org **or** 12 closed testers × 14 days)
- Physical YubiKey NFC (REV-13 / UX-09 remain Manual)
- Live StoreKit / Play sheets (fixture `store_iap` + Face ID / Touch ID ship without Day-0)
