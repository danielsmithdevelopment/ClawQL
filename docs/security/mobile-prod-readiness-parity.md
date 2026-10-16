# Mobile prod-readiness parity (critical gaps)

**Status:** Shipped with website critical gaps — 2026-10-15  
**Surface:** `apps/mobile` PhoneApprove

Paired with managed console work:

| Gap                         | Website                        | Mobile                                                                                                                                |
| --------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| Support login-as + audit    | Team → View as + JSONL + Audit | **Never starts** impersonation; Audit/Settings/Team explain console-only; fixture Audit shows example `support.impersonation.*` lines |
| Session kill                | Profile → end-others           | Profile → **Sign out everywhere else** (`session.end_others` → fixture Audit + live `POST /session/end-others`)                       |
| IdP login abuse ownership   | Settings → Sign-in             | Settings card + Day-0 checklist #22 → `idp-login-abuse-ownership.md`                                                                  |
| Backup / PITR restore drill | Settings → Privacy + runbook   | Settings card + Day-0 #24 → `restore-drill.md` (operators, not the phone)                                                             |
| AI enforcement posture      | Settings → Advanced            | Settings card + Day-0 #23 → `ai-enforcement-default-posture.md`                                                                       |

## Invariants

1. No mobile UI or API client starts `/api/managed/support/impersonation`.
2. Lost-device response on phone is session kill, not “view as”.
3. Approvals still require the same gateway / ATR path — mobile is not an enforcement bypass.
