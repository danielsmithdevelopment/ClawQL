# Execute pause and resume (v0.1)

Depends on [operation risk from the spec](./operation-risk-from-spec-v0.1.md). When `risk.policy === "mandate"`, `execute` **parks** the call instead of a bare refuse-and-retry.

## Flow

1. Agent calls `execute` with `operationId` + `args` (+ optional `fields`).
2. If policy is `allow` → run as today.
3. If policy is `block` → refuse (`status: "blocked"`); no park.
4. If policy is `mandate`:
   - Canonicalize `{ operationId, args, fields }` and SHA-256 → `argsHash`.
   - Persist a pending record under `$CLAWQL_HOME/pending-executions/` (default `~/.ClawQL/pending-executions/`).
   - WORM: `HUMAN_DECISION_REQUESTED`.
   - Return `status: "mandate_required"` with `executionId`, `argsHash`, `risk`, and how to approve (`clawql resume <id>` or MCP `resume`).
5. Human (or ChatGPT form, later) approves → `clawql resume <id>` / MCP `resume`:
   - Load pending; require `status === "pending"` and recompute `argsHash` match (tamper → reject).
   - WORM: `HUMAN_APPROVAL`.
   - **Atomic consume** before the side effect: conditional update
     `approved` → `outcome_unknown` where `argsHash` matches and `expiresAt` is still in the future
     (store clock — Postgres `now()`, never each replica’s wall clock). Zero rows → refuse.
   - WORM: `MANDATE_CONSUMED` (outcome unknown). Downstream calls should use
     idempotency key `clawql-mandate:<executionId>` where the API supports it (e.g. Stripe).
   - Run **exactly** the parked `operationId`/`args`/`fields`.
   - Finalize `outcome_unknown` → `completed` | `failed` (`MANDATE_FINALIZED`).
   - If the replica dies after consume, status stays **`outcome_unknown`** — surfaced in Review /
     audit; do **not** silently retry without the idempotency key.

## Pending record

```json
{
  "version": 1,
  "executionId": "pex_…",
  "operationId": "…",
  "args": {},
  "fields": null,
  "argsHash": "sha256:…",
  "risk": { "level": "MEDIUM", "policy": "mandate", "source": "spec-default", "reason": "…" },
  "status": "pending",
  "createdAt": "ISO-8601",
  "expiresAt": "ISO-8601",
  "approvedAt": null,
  "completedAt": null,
  "consumedAt": null,
  "consumedBy": null
}
```

Default TTL: 24h (`CLAWQL_PENDING_EXECUTION_TTL_HOURS`). Expired records cannot be resumed.

## Surfaces

| Surface                                     | Action                                  |
| ------------------------------------------- | --------------------------------------- |
| MCP `execute`                               | Parks on mandate; returns `executionId` |
| MCP `resume`                                | `{ executionId }` → run parked call     |
| CLI `clawql resume <executionId>`           | Same as MCP `resume`                    |
| CLI `clawql resume --decline <executionId>` | WORM `HUMAN_REJECTION`; mark declined   |

## Elicitation (deferred wire-up)

Where the client supports MCP standard elicitation / ChatGPT MRTR, approve **inside** the call using existing `buildMandateApprovalForm` (MEDIUM only). v0.1 always parks so CLI / Cursor / Claude Code share one path; elicitation is an additive fast-path later.

## Security

- Resume never accepts alternate `args` — only the parked payload.
- Bypass is scoped to one `executionId` after **atomic consume**; it does not widen ATR or clear `block`.
- Concurrent resume / `approvedExecutionId` execute: at most one consume wins. **Managed multi-node:** Postgres `UPDATE … WHERE … AND expires_at > NOW() RETURNING` (`CLAWQL_PENDING_DATABASE_URL`). Single-node self-host may use SQLite. Formal model: [`formal/tla/mandate/`](../../../formal/tla/mandate/).
- Pending files are `0600`; args may contain secrets — **not** included in default home sync.
- Pre-launch audit hunt for historical double-execute: `node scripts/formal/audit-mandate-double-execute.mjs`.
