# Local development — **no Apple / Google / EAS signup**

You can build and exercise the full PhoneApprove UX without Developer accounts.

## One command

```bash
cd apps/mobile
npm install
npm start                 # fixture mode (EXPO_PUBLIC_CLAWQL_FIXTURE=1)
```

Then press `w` for web, or scan the QR with Expo Go on a phone (still no Apple/Google enrollment).

Sign-in screen → **Continue with fixture session** (or **App Store reviewer demo** for biometric approve).

## What works offline / fixture

| Surface | Local without signup |
| ------- | -------------------- |
| Home queue + spend + recent activity | ✅ fixtures |
| Review filters (change / source / decision / skill) | ✅ |
| Approve with simulated NFC (fixture session) | ✅ no YubiKey needed |
| Approve with reviewer-demo biometrics | ✅ |
| Decision answer / skip / ask teammate | ✅ |
| Skill promote / decline | ✅ |
| Outcome-unknown mark applied / retry with key | ✅ |
| Activity feed (after decisions) | ✅ |
| Pull-to-refresh on Home / Review / Activity | ✅ |
| Profile keys, revoke, delete-account UI | ✅ |
| Deep link parsing / Maestro MOB-01…07 | ✅ (sim/emulator or web) |
| Unit tests | `npm test` |
| Packaging preflight (no upload) | `npm run store:check` |

## What you can skip until you are ready

- Apple Developer / App Store Connect
- Google Play Console
- `eas init` / real `EAS_PROJECT_ID`
- Hosting `well-known/*` on `cloud.clawql.com`
- `eas build` / TestFlight / Play internal

Those live only under [`store/DAY0-CHECKLIST.md`](store/DAY0-CHECKLIST.md). Day-0 items are **warnings**, not blockers for local work.

## Optional: static web export (CI / screenshots)

```bash
npm run local:web-export   # → dist-web/ (no EAS login)
npx serve dist-web         # or any static file server
```

## Sanity check

```bash
npm run local:ready
```

Runs typecheck, vitest, and confirms fixture defaults — exit 0 means you can keep iterating without store signup.
