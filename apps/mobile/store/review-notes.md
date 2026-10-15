# App Store / Play review notes (v1)

## What ClawQL is

ClawQL PhoneApprove is the phone client for **ClawQL Cloud**, a B2B operations product. Organizations use it so people can **review exact-change requests** from agents and tools (Approve / Decline / Ask a teammate), plus related managed-console jobs on device (Memory, API keys, Gateway, Automations, Audit, Settings, spend visibility, team).

PhoneApprove is a **free companion** to the paid web console / org subscription. The app does **not** sell subscriptions, show prices, or steer users to pay. Plan status is read-only for reference under Apple Guidelines **3.1.3(c) Enterprise Services** and **3.1.3(f) Free Stand-alone Apps**.

## Why approvals need a hardware security key

Production approvals bind a human decision to a **FIDO2 / NFC security key** (for example a YubiKey 5 NFC). That is intentional: agents and push notifications alone must not silently authorize irreversible changes. Mandate digest binding rejects approving a request that changed while the reviewer was offline.

Physical NFC (tap the key to the phone) is the production path (REV-13 / UX-09). Reviewers should **not** need a YubiKey — use the demo account below.

## How the reviewer demo account approves

1. On Sign-in, tap **App Store reviewer demo (biometric)** (or use the `org_clawql_reviewer_demo` credentials once live IdP is wired).
2. Open a pending request from Review / Home.
3. Approve with **device biometrics** (Face ID / Touch ID) instead of a hardware key.
4. Every such approval is audit-tagged `device_biometric_reviewer_demo` and cannot be used for production orgs.

Sample / fixture data in the reviewer demo org is **labeled** in the UI (“Reviewer demo · sample data”). Production builds without live data show empty states — never silent sample catalogs.

## Account deletion

Profile → **Delete account** runs the cascade (keys → org → billing hooks → vault → auth). Required by Apple Guideline 5.1.1(v).

## Sign in with Apple

v1 uses company SSO / browser OAuth and fixture/demo paths. We do **not** offer Google or other consumer social sign-in in v1, so Sign in with Apple is not required for this submission. If consumer social IdPs are added later, Sign in with Apple will ship in the same release.

## Face ID / Touch ID

App Lock and the reviewer-demo approve path use device biometrics (`expo-local-authentication`). Fixture / web builds use a one-tap unlock that stands in for Face ID / Touch ID. Production builds prompt the system sheet when enrolled.

## Voice assistant (typed + on-device TTS)

Profile → **Open voice assistant** accepts **typed** commands (and fixture buttons in demo builds): list pending, read next, decline first, ask a teammate, start a workflow. Replies can be spoken with **on-device** text-to-speech (`expo-speech` / AVSpeechSynthesizer). **No microphone listening** in this binary — Audio Data is not collected. **Approve never completes from voice alone** — the security-key / Face ID path on the review screen still runs. Native mic recognition and Siri App Intents are deferred.

## Accessibility

v1 ships with a WCAG-oriented gate on the fixture **web export** (`npm run a11y:lh`). Store review should still spot-check VoiceOver (iOS) and TalkBack (Android) on a device build.

## Privacy

See `store/privacy/apple-privacy-labels.md` and `store/privacy/play-data-safety.md`. Offline review cache is encrypted and stored outside backup (Caches + excludedFromBackup). API key secrets copy via local-only pasteboard with short expiry when the native bridge is present. Photos are collected only when the user attaches evidence.

## Export compliance

The binary declares `ITSAppUsesNonExemptEncryption = false` (exempt encryption only: TLS + AES-GCM protecting the app’s own offline cache). In Connect, treat the app as **using encryption that qualifies for exemption** — never answer “no encryption.” Details: `store/export-compliance.md`.
