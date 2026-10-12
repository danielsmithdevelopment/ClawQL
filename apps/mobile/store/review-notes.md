# App Store / Play review notes (v0.1)

## What this app is

ClawQL is an approval app for agentic tooling. Operators review exact-change requests from agents, then Approve (security key) or Decline. The web console covers everything else.

## Sign-in for reviewers

Use the **App Store reviewer demo** button on the Sign-in screen (or ask for the `org_clawql_reviewer_demo` credentials once live IdP is wired).

That org is deliberately allowed to approve with **device biometrics** because reviewers cannot present a YubiKey. Every such approval is audit-tagged `device_biometric_reviewer_demo` and cannot be used for production orgs.

## NFC security keys

Production orgs require tapping a FIDO2 security key (e.g. YubiKey 5 NFC) to the phone. REV-13 / UX-09 cover that path on a physical device. Reviewers should use the demo org instead.

## Account deletion

Profile → **Delete account** runs the existing cascade (keys → org → Stripe → vault → auth). Required by Apple Guideline 5.1.1(v).

## Sign in with Apple

v0.1 uses company SSO / browser OAuth (Okta-style) and fixture/demo paths. We do **not** offer Google or other consumer social sign-in in v0.1, so Sign in with Apple is not required for this submission. If consumer social IdPs are added later, Sign in with Apple will ship in the same release.

## Privacy

See `store/privacy/apple-privacy-labels.md` and `store/privacy/play-data-safety.md`.
