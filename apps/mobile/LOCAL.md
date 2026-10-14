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

## UI stack / design system

**Design system: [Material Design 3](https://m3.material.io/)** — see [`DESIGN.md`](DESIGN.md).

Screens use **`@expo/ui`** (`Host` + M3 Compose / SwiftUI) in **light** scheme — blue primary from navy seed, orange action accent only on filled CTAs. See [`DESIGN.md`](DESIGN.md). Icons: SF Symbols / Material XML on native, SVG on web (`AppIcon` + tonal `IconBubble`). Fixture Maestro `testID`s are unchanged. Pull-to-refresh uses `List.onRefresh`.

Not using IBM Carbon (enterprise web) — wrong fit for Expo native.

## What works offline / fixture

| Surface | Local without signup |
| ------- | -------------------- |
| Home queue + org card + spend + recent activity | ✅ fixtures |
| Spend by agent + month usage / team budgets | ✅ (+ `/api/managed/usage`) |
| Agents roster (status / spend / waiting) | ✅ |
| Morning digest preview | ✅ |
| Notification inbox (fixture pushes / digest) | ✅ |
| Team invite / roles / groups | ✅ fixtures (+ `/api/managed/team`) |
| Approval policies (list + detail) | ✅ read-only |
| Seeded decided archive (Activity drill-in) | ✅ |
| Review filters (change / source / decision / skill) | ✅ |
| Approve with simulated NFC (fixture session) | ✅ no YubiKey needed |
| Approve with reviewer-demo biometrics | ✅ |
| Decision answer / skip / ask named teammate | ✅ |
| Skill promote / decline | ✅ |
| Outcome-unknown mark applied / retry with key | ✅ |
| Activity feed (after decisions) | ✅ |
| Activity kind + outcome filters | ✅ |
| Profile reloads on tab focus | ✅ |
| Agents “needs you” → Review | ✅ |
| Pull-to-refresh on Home / Review / Activity + secondary screens | ✅ |
| Inbox empty state | ✅ |
| Profile keys, revoke, delete-account UI | ✅ |
| Signed-in sessions + sign out elsewhere | ✅ |
| Local push simulate (no APNs/EAS) | ✅ |
| Push device registration (fixture Expo token) | ✅ Profile |
| Camera / library document attach (fixture synthetic URI) | ✅ Review detail |
| Evidence preview + remove attachment | ✅ Review detail |
| Simulate push → notification inbox | ✅ |
| Session refresh + expiry gate (fixture renew) | ✅ Profile / boot |
| Mark inbox read on open | ✅ |
| Share request deep link | ✅ Review detail |
| App Lock (Face ID / Touch ID / fixture unlock) | ✅ Profile |
| Plan & billing fixture store_iap subscribe | ✅ Profile sandbox Pro/Team |
| Store IAP adapter + manage subscriptions link | ✅ `store-iap.ts` + Profile |
| Spend plan label + free upgrade CTA | ✅ Spend → Profile |
| Soft restore entitlements on session | ✅ SessionProvider |
| Biometric capability label (Face ID / Touch ID) | ✅ Profile + App Lock |
| Face ID usage copy (App Lock + purchases) | ✅ `app.config.ts` |
| Haptics on decide | ✅ Review |
| Home-screen icon badge = pending count | ✅ |
| Offline queue snapshot + cache banner | ✅ Home / Review |
| Notification prefs persisted on device | ✅ |
| Mark all inbox read | ✅ |
| System inbox Mark read | ✅ |
| Compact filter chips (~32px) | ✅ Review / Activity |
| Profile pull-to-refresh | ✅ |
| Chrome a11y labels (buttons / rows / chips / prefs) | ✅ |
| Activity drill-in to decided archive | ✅ |
| Deep links: review + inbox/digest/agents/spend/teammates/policies | ✅ |
| Voice assistant (typed + TTS + web mic) | ✅ `/voice` + Profile |
| Shortcuts / App Actions donation catalog | ✅ `/voice` share + `store/android/actions.xml` |
| Fixture workflows list / start | ✅ `/workflows` + voice “start …” |
| Memory explorer (search + detail) | ✅ `/memory` |
| API keys (issue / copy / revoke) | ✅ `/keys` (+ live `/api/managed/keys`) |
| Connections accounts | ✅ `/connections` (+ live `/api/managed/connections`) |
| Sessions / Skills | ✅ `/sessions` · `/skills` (+ `/api/managed/sessions|skills`) |
| Memory live adapter | ✅ `/api/managed/memory` (fixture-backed) |
| Gateway / Automations / Audit / Settings | ✅ in-app (Audit incident + Settings network/privacy) |
| Deep link parsing / Maestro MOB-01…32 | ✅ |
| Unit tests | `npm test` |
| Web e2e (store_iap + Face ID + voice + memory/keys) | `npm run local:web-export && npm run test:e2e` |
| Packaging preflight (no upload) | `npm run store:check` |

## What you can skip until you are ready

- Apple Developer / App Store Connect
- Google Play Console
- `eas init` / real `EAS_PROJECT_ID`
- Hosting `well-known/*` on `cloud.clawql.com`
- `eas build` / TestFlight / Play internal

Those live only under [`store/DAY0-CHECKLIST.md`](store/DAY0-CHECKLIST.md). Day-0 items are **warnings**, not blockers for local work.

## Fixture client status

PhoneApprove **fixture UX** covers approval plus console-parity surfaces (Memory, API keys, Gateway, Automations, Audit, Settings, Team invite, Usage depth). Managed routes exist for memory/sessions/skills/team/usage/keys/connections; deeper live backends (push register, evidence upload) remain.

## Optional: static web export (CI / screenshots)

```bash
npm run local:web-export   # → dist-web/ (no EAS login)
npx serve dist-web -l 4173
npm run a11y:lh            # Lighthouse a11y/BP/SEO 100 + axe WCAG (or set CLAWQL_MOBILE_DEMO_URL)
npm run demo:parity-iphone # Playwright @ iPhone 14 viewport (390×844) — never desktop width
```

Web export is a **CI stand-in** when no iOS Simulator / Android emulator is available.
Always demo at phone viewport (`scripts/record-*.mjs`). App Store / Play validation still needs a real device or EAS build.

## Sanity check

```bash
npm run local:ready
```

Runs typecheck, vitest, and confirms fixture defaults — exit 0 means you can keep iterating without store signup.

## Performance (Lighthouse equivalents)

```bash
npm run a11y:lh        # Lighthouse mobile (a11y=100) + axe WCAG 2.1 A/AA on fixture screens
npm run perf:lab       # bundle (web/ios/android) + LH mobile + CPU flame + assert
npm run perf:android   # Flashlight on a connected Android device
npm run perf:ios       # Instruments / RN DevTools runbook
```

Details and artifact map: [`PERFORMANCE.md`](PERFORMANCE.md). Lab output lands in `perf/out/` (open `cpu-profile.cpuprofile` in [speedscope.app](https://www.speedscope.app)).
