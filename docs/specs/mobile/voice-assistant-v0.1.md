# PhoneApprove voice assistant + Siri — v0.1

**Status:** Spec v0.1 + Phase 1 fixture scaffolding  
**Surfaces:** `apps/mobile` · (later) iOS App Intents / Siri Shortcuts · Android App Actions  
**Related:** [`docs/design/clawql-mobile.md`](../../design/clawql-mobile.md) · [`apps/mobile/LOCAL.md`](../../../apps/mobile/LOCAL.md) · [mobile-store-iap-v0.1](../billing/mobile-store-iap-v0.1.md)

## Goal

People can **talk to ClawQL on the phone**:

1. **In-app voice** — dictate or type “list pending”, hear titles read aloud, decline or open a request.
2. **Siri / system assistant** — “Hey Siri, ask ClawQL what’s waiting” / “approve the first request after you read it” once App Intents ship on a native build.

## Naming

| User says                     | What we implement                                                                                       |
| ----------------------------- | ------------------------------------------------------------------------------------------------------- |
| “Talk to the app” / dictation | In-app command parser + mic (Web Speech / `expo-speech-recognition`)                                    |
| “Read them out”               | TTS via `expo-speech` (Phase 1)                                                                         |
| “Hey Siri, …”                 | iOS **App Intents** + App Shortcuts (Phase 2 — needs SDK 58 `expo-app-intents` or custom Swift + Day-0) |
| “Google, …”                   | Android App Actions (Phase 3)                                                                           |

## Safety (hard rules)

- **Approve never skips the security key.** Voice may _confirm intent_ and open the approve path; NFC / Face ID / reviewer-demo biometric still required.
- Decline / open / list are allowed after voice (same as taps).
- Spoken content is **titles + short status only** — no secrets, API keys, or full digests by default.

## Phase 1 (shipped without Day-0)

| Piece                                                                           | Status                                        |
| ------------------------------------------------------------------------------- | --------------------------------------------- |
| Command grammar (`list` / `read` / `decline` / `open` / `ask` / `start` / help) | `apps/mobile/src/services/voice-assistant.ts` |
| Typed + fixture dictate on `/voice`                                             | `apps/mobile/app/voice.tsx`                   |
| Web browser mic (`SpeechRecognition`)                                           | `webDictateEffect` (no Info.plist)            |
| TTS read-out (`expo-speech`, web `speechSynthesis` fallback)                    | Same service                                  |
| Prefs: Voice assistant on, Speak replies                                        | DevicePrefs                                   |
| Deep link `clawql://voice?q=…` · `clawql://workflows`                           | Deep-link parser                              |
| Shortcuts / App Actions donation catalog                                        | `shortcuts-donation.ts` + `actions.xml`       |
| Fixture workflows list / start                                                  | `/workflows` + voice                          |
| Maestro MOB-24…25 + Playwright e2e                                              | Catalog                                       |

Native mic STT and Siri phrases wait for Day-0 enrollment.

## Phase 2 — Siri / App Intents (your plug-in)

Suggested intents (Swift / `expo-app-intents` when on SDK 58+):

| Intent                       | Example phrases                                        | App action                             |
| ---------------------------- | ------------------------------------------------------ | -------------------------------------- |
| `ListPendingApprovalsIntent` | “List my ClawQL approvals”, “What’s waiting in ClawQL” | Speak pending titles; open `/voice`    |
| `ReadNextApprovalIntent`     | “Read my next ClawQL request”                          | TTS first pending summary              |
| `DeclineApprovalIntent`      | “Decline the first ClawQL request”                     | `decideReview(decline)` after confirm  |
| `OpenApprovalIntent`         | “Open ClawQL review …”                                 | Deep link `/review/:id`                |
| `StartApproveIntent`         | “Approve with ClawQL”                                  | Open review detail → existing key path |

Donation / App Shortcuts: show in Shortcuts app after first use. Locked-device Siri needs Foreground App Intent entitlements.

## Phase 1.5 — ask teammate + start workflow (shipped fixture)

- “ask dana” / “ask marcus” → `decideReview(ask_teammate)` on first pending
- “list workflows” / “start standup digest” / “start weekly spend digest” → fixture `/workflows`
- Share Shortcut / App Actions deep-link cards on `/voice`

## Phase 3 — richer workflows

- Live console program cells (not fixture-only)
- Continuous listen while Review is open (push-to-talk)

## Out of scope for v0.1

- Unattended approve from Siri with no biometric/NFC
- Always-on wake word inside the app
- Cloud speech vendors (on-device / OS speech only)

## Acceptance

- [x] Fixture: typed “list pending” returns spoken + on-screen titles
- [x] Fixture: “decline first” removes a pending item (no key)
- [x] “approve first” refuses silent approve and points at security-key path
- [ ] Device: mic dictation fills the command box (Phase 2)
- [ ] Device: Siri phrase opens list/read (Phase 2 Day-0)
