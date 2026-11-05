# Agent Substrate session (TLA+)

`AgentSubstrateSession.tla` — create → suspend/resume → terminate.

| Config                          | `WeakRebirthAfterTerminate` | Expect                                       |
| ------------------------------- | --------------------------- | -------------------------------------------- |
| `AgentSubstrateSession.cfg`     | `FALSE`                     | **PASS** — at most one Create                |
| `AgentSubstrateSessionWeak.cfg` | `TRUE`                      | **COUNTEREXAMPLE** — rebirth after terminate |

```bash
scripts/formal/run-agent-substrate-session-tlc.sh
```

Code: `packages/clawql-sandbox/src/agent-substrate/agent-substrate-session-transition.ts`
wired into `service.ts` (`ensureSession` / `suspend` / `resume` / `terminate`).
