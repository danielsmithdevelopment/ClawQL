# HITL resume idempotency (TLA+)

`HitlResumeIdempotency.tla` — ClawQL Argo suspend/resume plane (webhook + NATS).

| Config                          | `WeakDoubleResumeMutation` | Expect                               |
| ------------------------------- | -------------------------- | ------------------------------------ |
| `HitlResumeIdempotency.cfg`     | `FALSE`                    | **PASS** — ≤1 mutating Resume        |
| `HitlResumeIdempotencyWeak.cfg` | `TRUE`                     | **COUNTEREXAMPLE** — double mutation |

```bash
scripts/formal/run-hitl-resume-idempotency-tlc.sh
```

Code: `packages/clawql-automation/src/workflow/hitl-resume-transition.ts`  
wired into `suspend-resume.ts` (`suspendWorkflowEffect` / `resumeWorkflowEffect`).
