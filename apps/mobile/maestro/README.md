# Maestro flows (ClawQL mobile)

Goal-oriented flows for iOS Simulator and Android Emulator. Run against a fixture build:

```bash
# Terminal A
cd apps/mobile
EXPO_PUBLIC_CLAWQL_FIXTURE=1 npx expo start

# Terminal B — after installing a development build / Expo Go with scheme clawql
maestro test maestro/flows
```

| Flow | Catalog | Covers |
| ---- | ------- | ------ |
| `mob-01-sign-in-fixture.yaml` | MOB-01 | Sign-in without localhost |
| `mob-02-review-decline.yaml` | MOB-02 | Decline exact-change request |
| `mob-03-approve-reviewer-demo.yaml` | MOB-03 | Reviewer biometric approve |
| `mob-04-push-deeplink.yaml` | MOB-04 | Push/deep link opens request |
| `mob-05-revoke-and-delete.yaml` | MOB-05 | Revoke app + delete account |
| `mob-06-sign-out.yaml` | MOB-06 | Sign out |

**Still device-only (Manual):** REV-13, UX-09 — physical YubiKey NFC. Use `modules/clawql-nfc-security-key` mock injection in CI until the native modules ship.
