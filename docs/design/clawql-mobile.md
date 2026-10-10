# ClawQL mobile (iOS + Android)

Expo approval client. Scope is intentionally narrow so the App Store does not treat it as a website wrapper.

## Surfaces

| Screen  | Job                                                                                     |
| ------- | --------------------------------------------------------------------------------------- |
| Sign in | System browser OAuth + app/universal link return; fixture + reviewer-demo for CI/review |
| Home    | Needs-you queue snapshot + today's spend                                                |
| Review  | Queue + exact-change detail; Decline; Approve with security key                         |
| Profile | Keys, connected apps (Revoke), notification prefs, sign out, **delete account**         |

All other product surfaces deep-link or open the web console.

## Auth

- Redirect URI: `clawql://auth/callback` and `https://cloud.clawql.com/app/...`
- No localhost (critical for agent/MCP auth narratives)
- Reviewer demo org: biometric approve allowed, audit-tagged `device_biometric_reviewer_demo`

## Security key

- Production: NFC FIDO2 via native modules (iOS AuthenticationServices security-key provider; Android Credential Manager)
- Stub: `apps/mobile/modules/clawql-nfc-security-key` + `globalThis.__CLAWQL_NFC_SECURITY_KEY__` for tests

## Store

- iOS: individual Apple Developer enrollment until C-Corp + D-U-N-S
- Android: Play internal testing until organization account
- iPhone only (`supportsTablet: false`)

## Testing

- Vitest for Effect domain/API/NFC/deeplink
- Maestro MOB-01…06 on simulator/emulator
- REV-13 / UX-09 remain Manual on device

See `apps/mobile/README.md`.
