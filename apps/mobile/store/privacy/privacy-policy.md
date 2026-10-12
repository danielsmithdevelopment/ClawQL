# ClawQL Privacy Policy (mobile app v0.1)

**Last updated:** 2026-10-11  
**Contact:** privacy@clawql.com · **Product:** ClawQL mobile (`com.clawql.app`)

## What we collect

When you use the ClawQL approval app we process:

- **Account data** — name, email, user id from your organization’s identity provider (Okta / SSO)
- **Push token** — device push identifier so we can notify you of approval requests
- **Product interaction** — approve / decline decisions and related audit metadata required for security

We do **not** sell personal data. We do **not** use third-party advertising SDKs. Tracking (IDFA / advertising identifiers) is off.

## Why we collect it

- Authenticate you into your ClawQL organization
- Deliver approval requests and deep links
- Maintain an auditable record of security-sensitive decisions

## Security keys & biometrics

Production approvals use a FIDO2 security key (NFC). Face ID / device biometrics are used only for the **App Store reviewer demo** organization and are tagged in audit logs. Biometric templates never leave the device.

## Account deletion

In the app: **Profile → Delete account**. That starts the cascade that removes keys, org membership, billing hooks, vault data, and auth subject for your account (Apple Guideline 5.1.1(v)).

## Sharing

Data stays within your ClawQL tenant and subprocessors required to run the service (hosting, IdP, push). We do not share data for advertising.

## Retention

Audit records follow your organization’s retention policy in the ClawQL console. Push tokens are dropped when you sign out or revoke notification permission.

## Children

The app is for workplace operators. It is not directed at children under 13.

## Changes

Material changes will be posted here and, when required, surfaced in-app or via your organization admin.

## Labels

Machine-readable store questionnaires: `apple-privacy-labels.md`, `play-data-safety.md`.
