# ClawQL mobile (iOS + Android)

Expo PhoneApprove client. **Goal: full managed-console parity on the phone** — same jobs as `cloud.clawql.com` managed nav, with phone-native rails (NFC, Face ID, Voice, push) on top. Surfaces deepen fixture → live API; nothing is permanently “web only.”

See [`docs/specs/mobile/console-parity-v0.1.md`](../specs/mobile/console-parity-v0.1.md).

## Surfaces

| Screen                                                 | Job                                                                                     |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| Sign in                                                | System browser OAuth + app/universal link return; fixture + reviewer-demo for CI/review |
| Home                                                   | Needs-you queue snapshot + today's spend                                                |
| Review                                                 | Queue + exact-change detail; Decline; Approve with security key                         |
| Activity                                               | Decision / archive feed                                                                 |
| Profile                                                | Keys, apps, prefs, plan, **console destinations**, sign out, delete account             |
| Memory                                                 | Explorer search + field detail                                                          |
| Sessions                                               | Agent session timeline                                                                  |
| Skills                                                 | Proposed queue + active skills                                                          |
| Connections                                            | Accounts / sources (+ live adapter)                                                     |
| API keys                                               | Issue / copy secret once / revoke (+ live adapter)                                      |
| Gateway                                                | Endpoint catalog                                                                        |
| Automations                                            | Subscription health list                                                                |
| Audit                                                  | Recent entries + chain incident                                                         |
| Settings                                               | Org + network + retention                                                               |
| Voice / Workflows                                      | Phone-native assistant + fixture program start                                          |
| Spend / Agents / Digest / Inbox / Teammates / Policies | Console-parity secondary surfaces                                                       |

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
- Maestro MOB-01…30 on simulator/emulator (+ CI Playwright web export)
- REV-13 / UX-09 remain Manual on device

See `apps/mobile/README.md` · voice: [`docs/specs/mobile/voice-assistant-v0.1.md`](../specs/mobile/voice-assistant-v0.1.md) · parity: [`docs/specs/mobile/console-parity-v0.1.md`](../specs/mobile/console-parity-v0.1.md).
