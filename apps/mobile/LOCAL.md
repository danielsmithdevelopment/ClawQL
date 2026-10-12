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

## UI stack

Screens use **`@expo/ui`** universal components (`Host` + Material 3 / SwiftUI) with ClawQL `brand.seed` tint. Icons: SF Symbols / Material XML on native, SVG stroke fallbacks on web (`AppIcon` + tonal `IconBubble`). Fixture Maestro `testID`s are unchanged. Pull-to-refresh uses `List.onRefresh`.

## What works offline / fixture

| Surface | Local without signup |
| ------- | -------------------- |
| Home queue + org card + spend + recent activity | ✅ fixtures |
| Spend by agent | ✅ |
| Agents roster (status / spend / waiting) | ✅ |
| Morning digest preview | ✅ |
| Notification inbox (fixture pushes / digest) | ✅ |
| Who can approve (teammates) | ✅ read-only |
| Approval policies (list + detail) | ✅ read-only |
| Seeded decided archive (Activity drill-in) | ✅ |
| Review filters (change / source / decision / skill) | ✅ |
| Approve with simulated NFC (fixture session) | ✅ no YubiKey needed |
| Approve with reviewer-demo biometrics | ✅ |
| Decision answer / skip / ask teammate | ✅ |
| Skill promote / decline | ✅ |
| Outcome-unknown mark applied / retry with key | ✅ |
| Activity feed (after decisions) | ✅ |
| Pull-to-refresh on Home / Review / Activity | ✅ |
| Profile keys, revoke, delete-account UI | ✅ |
| Signed-in sessions + sign out elsewhere | ✅ |
| Local push simulate (no APNs/EAS) | ✅ |
| Activity drill-in to decided archive | ✅ |
| Deep link parsing / Maestro MOB-01…10 | ✅ (sim/emulator or web) |
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

## Performance (Lighthouse equivalents)

```bash
npm run perf:lab       # bundle (web/ios/android) + LH mobile + CPU flame + assert
npm run perf:android   # Flashlight on a connected Android device
npm run perf:ios       # Instruments / RN DevTools runbook
```

Details and artifact map: [`PERFORMANCE.md`](PERFORMANCE.md). Lab output lands in `perf/out/` (open `cpu-profile.cpuprofile` in [speedscope.app](https://www.speedscope.app)).
