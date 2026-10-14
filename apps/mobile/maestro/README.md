# Maestro flows (ClawQL mobile)

Goal-oriented flows for iOS Simulator and Android Emulator. Run against a fixture build:

```bash
# Terminal A
cd apps/mobile
EXPO_PUBLIC_CLAWQL_FIXTURE=1 npx expo start

# Terminal B — after installing a development build / Expo Go with scheme clawql
maestro test maestro/flows
# or one flow:
maestro test maestro/flows/mob-19-system-mark-read.yaml
```

Catalog source of truth: [`catalog.ts`](catalog.ts).

| Flow | Catalog | Covers |
| ---- | ------- | ------ |
| `mob-01-sign-in-fixture.yaml` | MOB-01 | Sign-in without localhost |
| `mob-02-review-decline.yaml` | MOB-02 | Decline exact-change request |
| `mob-03-approve-reviewer-demo.yaml` | MOB-03 | Reviewer biometric approve |
| `mob-04-push-deeplink.yaml` | MOB-04 | Push/deep link opens request |
| `mob-05-revoke-and-delete.yaml` | MOB-05 | Revoke app + delete account |
| `mob-06-sign-out.yaml` | MOB-06 | Sign out |
| `mob-07-approve-fixture-nfc.yaml` | MOB-07 | Fixture NFC approve |
| `mob-08-decision-and-filter.yaml` | MOB-08 | Decision answer + queue filter |
| `mob-09-skill-and-outcome.yaml` | MOB-09 | Skill promote / outcome unknown |
| `mob-10-sessions-and-push.yaml` | MOB-10 | Sessions + local push path |
| `mob-11-push-register-and-scan.yaml` | MOB-11 | Push register + document scan |
| `mob-12-session-refresh.yaml` | MOB-12 | Session refresh |
| `mob-13-app-lock.yaml` | MOB-13 | App Lock on / lock / unlock |
| `mob-14-offline-cache.yaml` | MOB-14 | Offline cache + mark all inbox read |
| `mob-15-ask-teammate.yaml` | MOB-15 | Ask a named teammate |
| `mob-16-attachment-preview-remove.yaml` | MOB-16 | Evidence preview + remove |
| `mob-17-surface-deeplinks.yaml` | MOB-17 | Inbox / digest / agents / policy deep links |
| `mob-18-activity-filters.yaml` | MOB-18 | Activity kind + outcome filters |
| `mob-19-system-mark-read.yaml` | MOB-19 | System inbox Mark read |
| `mob-20-store-subscribe-sandbox.yaml` | MOB-20 | Fixture store_iap Pro subscribe + Face ID / App Lock |
| `mob-21-store-restore-manage.yaml` | MOB-21 | Restore purchases + Manage subscriptions |
| `mob-22-faceid-app-lock-labels.yaml` | MOB-22 | Face ID / Touch ID App Lock unlock |
| `mob-23-spend-upgrade-cta.yaml` | MOB-23 | Spend upgrade CTA → Profile billing |
| `mob-24-voice-list-pending.yaml` | MOB-24 | Voice assistant list pending (fixture) |
| `mob-25-voice-workflow-shortcuts.yaml` | MOB-25 | Voice start workflow + Shortcuts share |
| `mob-26-memory-explorer.yaml` | MOB-26 | Memory explorer search + detail |
| `mob-27-api-keys.yaml` | MOB-27 | API keys issue + secret |
| `mob-28-sessions.yaml` | MOB-28 | Sessions timeline |
| `mob-29-skills.yaml` | MOB-29 | Skills proposed + active |
| `mob-30-connections-settings.yaml` | MOB-30 | Connections + Settings network |
| `mob-31-team-invite.yaml` | MOB-31 | Team invite + roles |
| `mob-32-usage-depth.yaml` | MOB-32 | Usage month + team budgets |

**Still device-only (Manual):** REV-13, UX-09 — physical YubiKey NFC. Use `modules/clawql-nfc-security-key` mock injection in CI until the native modules ship.

**CI web e2e (Playwright on fixture export):** `npm run test:e2e` — MOB-20…30 style paths without a simulator (see `e2e/`).

**Web / CI a11y gate (not Maestro):** `npm run a11y:lh` — Lighthouse mobile a11y/BP/SEO 100 + axe WCAG 2.1 A/AA on the fixture web export.
