# Account deletion vs WORM (TLA+)

`AccountDeletionWorm.tla` — resumable cascade deletion must not erase the audit
trail; GDPR erasure is **cryptographic shred** of vault PII, not WORM delete.

| Config                        | `WeakUnsafeFinalize` | Expect             |
| ----------------------------- | -------------------- | ------------------ |
| `AccountDeletionWorm.cfg`     | `FALSE` (target)     | **PASS**           |
| `AccountDeletionWormWeak.cfg` | `TRUE` (historical)  | **COUNTEREXAMPLE** |

```bash
scripts/formal/run-account-deletion-worm-tlc.sh
```

## Invariants

1. **WormOnlyAfterSystems** — `ACCOUNT_DELETED` only after keys→org→stripe→vault→supabase
2. **AtMostOneAccountDeleted** — one append, even across resume
3. **WormNeverErased** — once written, the entry stays retained
4. **CompletedImpliesErasureAndWorm** — completed ⇒ vault shred + identity gone + one retained WORM

## Mapping

| Spec                         | Code                                                                              |
| ---------------------------- | --------------------------------------------------------------------------------- |
| Steps 1..5                   | `ACCOUNT_DELETION_STEPS` in `account-deletion-job-store.ts`                       |
| `RunNextStep` / `CrashRetry` | `runJob` + durable job store                                                      |
| Job/step status graph        | `account-deletion-transition.ts` (Start/Fail/Resume/Complete; Complete/Skip/Fail) |
| TLA `open`                   | job `pending` \| `in_progress` (Effect refinement)                                |
| Vault step (`s=4`)           | `eraseAuthorizedEffect` / crypto-shred                                            |
| `FinalizeAtomic`             | `finalize` → `Complete` → `buildAccountDeletedEntry` once                         |
| `ResumeCompleted`            | `runJob` early return when `completed` + `wormWritten`                            |
| Weak\*                       | early WORM, WORM erase, or complete with PII still readable                       |

Service: `packages/clawql-payments/src/provisioning/account-deletion-service.ts`  
Transitions: `packages/clawql-payments/src/provisioning/account-deletion-transition.ts`  
Spec: `docs/specs/auth/supabase-managed-signup-v0.1.md` (§ Account deletion)
