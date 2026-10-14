# App Store / Play review notes (v0.1)

## What this app is

ClawQL PhoneApprove is the phone client for ClawQL Cloud: review exact-change requests (Approve with security key / Decline), plus managed-console jobs on device (Memory explorer, API keys, Gateway, Automations, Audit, Settings, spend, team). The web console remains available; it is not the only place for those jobs.

## Sign-in for reviewers

Use the **App Store reviewer demo** button on the Sign-in screen (or ask for the `org_clawql_reviewer_demo` credentials once live IdP is wired).

That org is deliberately allowed to approve with **device biometrics** because reviewers cannot present a YubiKey. Every such approval is audit-tagged `device_biometric_reviewer_demo` and cannot be used for production orgs.

## NFC security keys

Production orgs require tapping a FIDO2 security key (e.g. YubiKey 5 NFC) to the phone. REV-13 / UX-09 cover that path on a physical device. Reviewers should use the demo org instead.

## Account deletion

Profile → **Delete account** runs the existing cascade (keys → org → Stripe → vault → auth). Required by Apple Guideline 5.1.1(v).

## Sign in with Apple

v0.1 uses company SSO / browser OAuth (Okta-style) and fixture/demo paths. We do **not** offer Google or other consumer social sign-in in v0.1, so Sign in with Apple is not required for this submission. If consumer social IdPs are added later, Sign in with Apple will ship in the same release.

## Face ID / Touch ID

App Lock and purchase confirm use device biometrics (`expo-local-authentication`). Fixture / web builds use a one-tap unlock that stands in for Face ID / Touch ID. Production builds prompt the system Face ID or Touch ID sheet when enrolled.

## Voice assistant

Profile → **Open voice assistant** (or `clawql://voice`) accepts typed / fixture commands: list pending, read next, decline first, ask a teammate, start a workflow. Replies can be spoken with on-device TTS. **Approve never completes from voice alone** — the security-key / Face ID path on the review screen still runs. Shortcuts / App Actions donation cards copy the same deep links; native Siri App Intents land after Day-0.

## In-app subscribe (sandbox)

Profile → **Plan & billing** → **Subscribe Pro (sandbox)** flips fixture `store_iap` entitlements (no real charge). Live App Store / Play sheets land after Day-0 SKU enrollment. Reviewers can exercise the sandbox path without a paid Apple/Google account.

## Accessibility

v0.1 ships with a WCAG-oriented gate on the fixture **web export** (`npm run a11y:lh`: Lighthouse Accessibility / Best Practices / SEO at 100, axe WCAG 2.1 A/AA with no serious findings). Store review should still spot-check VoiceOver (iOS) and TalkBack (Android) on a device build.

## Privacy

See `store/privacy/apple-privacy-labels.md` and `store/privacy/play-data-safety.md`.
