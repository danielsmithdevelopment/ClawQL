-------------------------- MODULE AccountDeletionWorm --------------------------
(***************************************************************************)
(* Account deletion cascade vs WORM retention.                             *)
(*                                                                         *)
(* Maps to clawql-payments provisioning:                                   *)
(*   account-deletion-service.ts  — ordered steps + finalize               *)
(*   account-deletion-transition.ts — job/step (status,event) table        *)
(*   ACCOUNT_DELETED via PaymentAuditService (hashed refs only)            *)
(*                                                                         *)
(* Steps (fixed order): keys → org → stripe → vault → supabase             *)
(* Then identity delete + single ACCOUNT_DELETED append.                   *)
(*                                                                         *)
(* Vault step = cryptographic shred (key delete); WORM ciphertext/hashes   *)
(* remain. PII becomes unreadable; the audit entry is never erased.        *)
(*                                                                         *)
(* WeakUnsafeFinalize = TRUE enables early WORM, WORM erase, or complete   *)
(* without vault shred — TLC must violate Safety.                          *)
(***************************************************************************)

EXTENDS Naturals, Sequences, TLC

CONSTANTS
  WeakUnsafeFinalize,  \* BOOLEAN — TRUE = buggy finalize / erase oracle
  MaxRetries           \* bound crash/retry loops (e.g. 3)

VARIABLES
  stepDone,            \* [1..5 |-> BOOLEAN] keys,org,stripe,vault,supabase
  identityDeleted,
  wormWritten,         \* count of ACCOUNT_DELETED appends
  wormRetained,        \* FALSE only under weak erase
  piiReadable,         \* TRUE until vault crypto-shred
  retries,
  status               \* "open" | "completed" | "failed"

Steps == 1..5

TypeOK ==
  /\ stepDone \in [Steps -> BOOLEAN]
  /\ identityDeleted \in BOOLEAN
  /\ wormWritten \in Nat
  /\ wormRetained \in BOOLEAN
  /\ piiReadable \in BOOLEAN
  /\ retries \in 0..MaxRetries
  /\ status \in {"open", "completed", "failed"}

Init ==
  /\ stepDone = [s \in Steps |-> FALSE]
  /\ identityDeleted = FALSE
  /\ wormWritten = 0
  /\ wormRetained = TRUE
  /\ piiReadable = TRUE
  /\ retries = 0
  /\ status = "open"

SystemsComplete == \A s \in Steps : stepDone[s]

\* Advance the next pending step in order (idempotent skip if already done).
RunNextStep ==
  /\ status = "open"
  /\ ~SystemsComplete
  /\ \E s \in Steps :
       /\ stepDone[s] = FALSE
       /\ \A t \in Steps : t < s => stepDone[t] = TRUE
       /\ stepDone' = [stepDone EXCEPT ![s] = TRUE]
       /\ piiReadable' = IF s = 4 THEN FALSE ELSE piiReadable  \* vault = 4
       /\ UNCHANGED <<identityDeleted, wormWritten, wormRetained, retries, status>>

\* Crash mid-cascade: bump retry counter; resume from durable stepDone.
CrashRetry ==
  /\ status = "open"
  /\ retries < MaxRetries
  /\ retries' = retries + 1
  /\ UNCHANGED <<stepDone, identityDeleted, wormWritten, wormRetained, piiReadable, status>>

\* Target finalize: systems complete → identity → one WORM append → completed.
FinalizeAtomic ==
  /\ ~WeakUnsafeFinalize
  /\ status = "open"
  /\ SystemsComplete
  /\ ~piiReadable                 \* vault shred already ran (step 4)
  /\ identityDeleted' = TRUE
  /\ wormWritten' = wormWritten + 1
  /\ wormRetained' = TRUE
  /\ status' = "completed"
  /\ UNCHANGED <<stepDone, piiReadable, retries>>

\* Idempotent resume of already-finalized job.
ResumeCompleted ==
  /\ status = "completed"
  /\ wormWritten >= 1
  /\ wormRetained
  /\ UNCHANGED <<stepDone, identityDeleted, wormWritten, wormRetained, piiReadable, retries, status>>

\* ---- Weak oracles (must break Safety) ----

WeakWriteWormEarly ==
  /\ WeakUnsafeFinalize
  /\ status = "open"
  /\ ~SystemsComplete
  /\ wormWritten' = wormWritten + 1
  /\ UNCHANGED <<stepDone, identityDeleted, wormRetained, piiReadable, retries, status>>

WeakEraseWorm ==
  /\ WeakUnsafeFinalize
  /\ wormWritten >= 1
  /\ wormRetained
  /\ wormRetained' = FALSE
  /\ UNCHANGED <<stepDone, identityDeleted, wormWritten, piiReadable, retries, status>>

\* Mark vault done without shredding — enables complete-with-PII-readable.
WeakVaultDoneWithoutShred ==
  /\ WeakUnsafeFinalize
  /\ status = "open"
  /\ stepDone[4] = FALSE
  /\ \A t \in Steps : t < 4 => stepDone[t] = TRUE
  /\ stepDone' = [stepDone EXCEPT ![4] = TRUE]
  /\ UNCHANGED <<identityDeleted, wormWritten, wormRetained, piiReadable, retries, status>>

WeakCompleteWithoutShred ==
  /\ WeakUnsafeFinalize
  /\ status = "open"
  /\ SystemsComplete
  /\ piiReadable                  \* vault marked done but not shredded
  /\ identityDeleted' = TRUE
  /\ wormWritten' = wormWritten + 1
  /\ status' = "completed"
  /\ UNCHANGED <<stepDone, wormRetained, piiReadable, retries>>

Next ==
  \/ RunNextStep
  \/ CrashRetry
  \/ FinalizeAtomic
  \/ ResumeCompleted
  \/ WeakWriteWormEarly
  \/ WeakEraseWorm
  \/ WeakVaultDoneWithoutShred
  \/ WeakCompleteWithoutShred

Spec == Init /\ [][Next]_<<stepDone, identityDeleted, wormWritten, wormRetained, piiReadable, retries, status>>

\* ---- Safety ----

WormOnlyAfterSystems ==
  wormWritten = 0 \/ SystemsComplete

AtMostOneAccountDeleted ==
  wormWritten <= 1

WormNeverErased ==
  wormWritten = 0 \/ wormRetained

\* Completed jobs have crypto-shredded PII and exactly one retained WORM entry.
CompletedImpliesErasureAndWorm ==
  status # "completed"
  \/ ( ~piiReadable
       /\ wormWritten = 1
       /\ wormRetained
       /\ identityDeleted
       /\ SystemsComplete )

Safety ==
  /\ TypeOK
  /\ WormOnlyAfterSystems
  /\ AtMostOneAccountDeleted
  /\ WormNeverErased
  /\ CompletedImpliesErasureAndWorm

=============================================================================
