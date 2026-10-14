# ClawQL mobile (iOS + Android)

Expo PhoneApprove client. **Goal: full managed-console parity on the phone** — same jobs as `cloud.clawql.com` managed nav, with phone-native rails (NFC, Face ID, Voice, push) on top. Surfaces deepen fixture → live API; nothing is permanently “web only.”

See [`docs/specs/mobile/console-parity-v0.1.md`](../specs/mobile/console-parity-v0.1.md).

## Surfaces

<<<<<<< HEAD
| Screen    | Job                                                                                                                                            |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Sign in   | System browser OAuth + app/universal link return; fixture + reviewer-demo for CI/review                                                        |
| Home      | Needs-you queue snapshot + today's spend                                                                                                       |
| Review    | Queue + exact-change detail; Decline; Approve with security key                                                                                |
| Profile   | Keys, connected apps (Revoke), notification prefs, voice prefs, sign out, **delete account**                                                   |
| Voice     | In-app assistant — list/read/decline/ask/start workflow; TTS; Shortcuts donation; Siri later ([spec](../specs/mobile/voice-assistant-v0.1.md)) |
| Workflows | Fixture programs startable by tap or voice                                                                                                     |

All other product surfaces deep-link or open the web console.
=======
| Screen | Job |
| ------ | --- |
| Sign in | System browser OAuth + app/universal link return; fixture + reviewer-demo for CI/review |
| Home | Needs-you queue snapshot + today's spend |
| Review | Queue + exact-change detail; Decline; Approve with security key |
| Activity | Decision / archive feed |
| Profile | Keys, apps, prefs, plan, **console destinations**, sign out, delete account |
| Memory | Explorer search + field detail |
| API keys | Issue / copy secret once / revoke (gateway keys) |
| Gateway | Endpoint catalog |
| Automations | Subscription health list |
| Audit | Recent WORM-style entries |
| Settings | Org general settings |
| Voice / Workflows | Phone-native assistant + fixture program start |
| Spend / Agents / Digest / Inbox / Teammates / Policies | Console-parity secondary surfaces |
>>>>>>> e61d43e3 (feat(mobile): full console parity — Memory explorer and API keys)

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
- Maestro MOB-01…27 on simulator/emulator (+ CI Playwright web export)
- REV-13 / UX-09 remain Manual on device

See `apps/mobile/README.md` · voice: [`docs/specs/mobile/voice-assistant-v0.1.md`](../specs/mobile/voice-assistant-v0.1.md) · parity: [`docs/specs/mobile/console-parity-v0.1.md`](../specs/mobile/console-parity-v0.1.md).
