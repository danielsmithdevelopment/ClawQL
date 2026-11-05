# WebMCP draft candidate (TLA+)

`WebMcpDraftCandidate.tla` — draft → approve/reject → publish.

| Config | `WeakPublishPending` | Expect |
| ------ | -------------------- | ------ |
| `WebMcpDraftCandidate.cfg` | `FALSE` | **PASS** — publish only after approve |
| `WebMcpDraftCandidateWeak.cfg` | `TRUE` | **COUNTEREXAMPLE** — publish from pending |

```bash
scripts/formal/run-webmcp-draft-tlc.sh
```

Code: `packages/clawql-core/src/providers/webmcp-draft/lifecycle/draft-candidate-transition.ts`
wired into `draft-store.ts` (`markReviewed` / `publishApproved` / `putCandidates`).
