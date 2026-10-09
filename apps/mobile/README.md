# ClawQL mobile (iOS + Android)

Expo Router app for **phone-native** approval: system-browser sign-in (no localhost), push deep links, exact-change review, NFC security-key approve (stub + reviewer biometric demo), profile with revoke + **in-app account deletion**.

Everything else opens the web console.

## Why this exists

Apple rejects thin website wrappers. This app ships the PhoneApprove surface from the managed console fixtures:

- **Home** — what needs you + today's spend
- **Review** — queue, exact-change detail, Decline, Approve with security key
- **Profile** — keys, connected apps (Revoke), notification prefs, sign out, delete account

## Stack

- Expo SDK 57 + Expo Router (TypeScript)
- Effect 4 services/schemas (same discipline as `packages/*`)
- EAS Build / Submit (`eas.json`)
- Maestro goal-oriented flows (`maestro/flows`)

## Quick start

```bash
cd apps/mobile
npm install
EXPO_PUBLIC_CLAWQL_FIXTURE=1 npm start
```

Fixture mode needs no backend. Staging:

```bash
EXPO_PUBLIC_CLAWQL_API_BASE=https://cloud.clawql.com \
EXPO_PUBLIC_CLAWQL_FIXTURE=0 \
npm start
```

## Tests

```bash
npm test          # vitest (schemas, API fixture, NFC mock, deep links)
npm run typecheck
# with simulator/emulator + Maestro CLI:
npm run maestro
```

## Store path (no D-U-N-S yet)

| Store | Track | Notes |
| ----- | ----- | ----- |
| iOS | Individual Apple Developer → TestFlight → App Store | Seller name is personal until C-Corp + org conversion |
| Android | Play **internal testing** | Production blocked without org/D-U-N-S or 12 closed testers × 14 days |

Human Day-0 checklist: Apple + Google enrollment, bundle id `com.clawql.app`, host `well-known/*` on `cloud.clawql.com`, support/privacy URLs, reviewer demo org.

## Universal / App Links

Templates live in `well-known/`. Publish after replacing `TEAMID` and the Android SHA-256:

- `https://cloud.clawql.com/.well-known/apple-app-site-association`
- `https://cloud.clawql.com/.well-known/assetlinks.json`

Deep links: `clawql://review/:id` and `https://cloud.clawql.com/app/review/:id`.

## NFC modules

`modules/clawql-nfc-security-key` is the JS injection point. Production wiring:

- iOS — `ASAuthorizationSecurityKeyPublicKeyCredentialProvider`
- Android — Credential Manager + NFC CTAP

Until linked, production sessions get `nfc_module_unavailable`. The **reviewer demo** org uses device biometrics and is audit-tagged.

## Catalog

| Id | Coverage |
| -- | -------- |
| MOB-01…06 | Maestro flows in this app |
| REV-13 / UX-09 | Physical YubiKey — still Manual |

See `store/review-notes.md` for App Review copy.
