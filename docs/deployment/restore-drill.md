# Restore drill (managed / self-hosted)

**Status:** Operator runbook — 2026-10-15  
**Pairs with:** [Disaster recovery curriculum §28](../security/security-best-practices-series/28-disaster-recovery-business-continuity.md), [Quarterly security checklist](../security/security-best-practices-series/25-quarterly-security-review-checklist.md), [SOC 2 Type II readiness packaging](../security/soc2-type2-readiness-packaging.md) (A1 availability evidence)

A backup you have never restored is a hope. Run this **at least quarterly** and after any major storage change. Record actual RTO/RPO below.

## Scope

| Artifact                           | Typical location                                         | Owner         |
| ---------------------------------- | -------------------------------------------------------- | ------------- |
| Postgres (memory / org / credits)  | Managed DB or Helm PVC                                   | Platform      |
| Dragonfly / Redis                  | Helm                                                     | Platform      |
| Vault / ESO secrets                | Vault PVC + unseal keys                                  | Security      |
| WORM / audit trail                 | clawql-audit backends / S3                               | Security      |
| Support impersonation JSONL        | `apps/dashboard/.data/support-impersonation-audit.jsonl` | Cloud console |
| Object storage (evidence, exports) | R2 / S3                                                  | Platform      |

## Drill steps (isolated environment)

1. **Freeze** — note wall-clock; do not restore onto production.
2. **Locate** last successful backup + PITR window (provider console or Velero / snapshots).
3. **Restore** into a throwaway namespace or DB instance with a new name.
4. **Verify**
   - App boots; managed console health OK.
   - Spot-check org rows and one audit / WORM chain verify.
   - Confirm support-impersonation JSONL (if present) still readable and hashes intact.
5. **Measure** restore duration (RTO) and newest recoverable timestamp (RPO).
6. **Destroy** the throwaway environment.
7. **Log** results in the table below and link the ticket.

## Record (copy per drill)

| Field                | Value |
| -------------------- | ----- |
| Date                 |       |
| Operator             |       |
| Backup ID / snapshot |       |
| PITR target time     |       |
| Measured RTO         |       |
| Measured RPO         |       |
| Failures / notes     |       |
| Ticket / PR          |       |

## Pass criteria

- Restore completed without silent data loss on sampled orgs.
- Audit / WORM verification did not fail open.
- Secrets restored via ESO/Vault path, not pasted from chat history.

## Related

- Vault PVC restore notes: [`external-secrets-operator-install.md`](./external-secrets-operator-install.md)
- Hosted vs self-hosted compliance: `docs/payments/hosted-vs-self-hosted-compliance.md`
