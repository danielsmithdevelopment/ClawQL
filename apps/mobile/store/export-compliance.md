# Export compliance (App Store Connect)

## What encryption PhoneApprove uses

| Use | Algorithm / rail | Purpose |
| --- | ---------------- | ------- |
| HTTPS to ClawQL Cloud | TLS (system stack) | Account, review, managed APIs |
| Offline review cache | AES-GCM (Web Crypto) + key in SecureStore / Keychain | Protect review / activity / inbox snapshot at rest |
| SecureStore session / cache key | Keychain / Keystore | Device-bound secrets |

No custom crypto for DRM, no proprietary cipher suites, no encryption offered as a product feature to end users.

## How to answer Connect

1. **Does your app use encryption?** → **Yes.** (Do not answer “No” — AES-GCM offline cache counts.)
2. **Is it exempt?** → **Yes.** Encryption is limited to authentication / protecting data the app stores or transmits for its own functionality (standard exemption).
3. Info.plist already sets `ITSAppUsesNonExemptEncryption` = **false** in `app.config.ts`, which means “no *non-exempt* encryption” (exempt uses only). That skips the questionnaire on every upload.

If Apple later asks for documentation and issues an `ITSEncryptionExportComplianceCode`, paste that value into `ios.infoPlist` alongside the boolean.

## Year-end note

Exempt HTTPS / ATS use can still require a U.S. **annual self-classification report** in some cases. Track that separately from the Info.plist key; it is not a per-build Connect answer.
