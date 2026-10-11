# Sources propose (v0.2)

Depends on [operation risk from the spec](./operation-risk-from-spec-v0.1.md). Agents may **propose** a custom source; a **distinct operator** **approves** before `sources.json` changes.

**Capability invariant:** agents hold capabilities, never credentials — and they never hold the approve capability. If the principal that proposed a source can also approve it, the invariant is gone.

## Flow

1. Agent calls MCP `sources_propose` with a URL (+ optional `name` / `kind` / `id`). ClawQL records `proposedBy` as `agent:<sessionId>`.
2. ClawQL fetches (SSRF-safe), detects kind, caches the body under `$CLAWQL_HOME/sources/<id>/`, loads operations, and classifies risk via `applyOperationRiskToLoadedOps`.
3. **`dryRun: true` (default)** — return a preview JSON (kind, op counts by risk policy, sample ops). **Does not** write `sources.json` or park a proposal.
4. **`dryRun: false`** — same preview **and** park a proposal under `$CLAWQL_HOME/pending-sources/` with `proposalId` (`psp_…`) and `proposedBy`. WORM: `HUMAN_DECISION_REQUESTED`.
5. A **person** approves on a human-only path — CLI `clawql sources approve <proposalId>` (operator credentials), console, or phone push. Same Effect core (`approveSourceEffect`); **not** an MCP tool:
   - Fail closed unless `approvedBy.kind === "operator"`
   - Fail closed if `approvedBy` equals `proposedBy`
   - `upsertCustomSource` + `resetSpecCache`
   - WORM: `HUMAN_APPROVAL`
   - Proposal marked `approved`
6. Decline: CLI `clawql sources decline <proposalId>` — same two-party gate → WORM `HUMAN_REJECTION`; status `declined`.

Single-party human add remains `clawql sources add` (no proposal). CLI `propose --commit` parks for a **different** operator; the same operator cannot approve their own parked proposal.

## Guardrails

- **`sources_approve` is not in the agent MCP catalog** (default-on Core or otherwise).
- Session seed strips `sources_approve` even if `CLAWQL_CAPABILITY_SESSION_SEED` or process registration lists it (`AGENT_NEVER_ISSUED_CAPABILITIES`).
- Propose **never** sets `trusted: true` (MCP annotations stay ignored until an operator marks trust).
- Propose **never** widens ATR / session catalog by itself — approve only adds the source; next `loadSpec` indexes ops.
- URL fetch uses the existing SSRF chokepoint (`assertSafeSourceFetchUrl`).
- v0.2 URL kinds: OpenAPI / Discovery / GraphQL / gRPC / MCP / WebMCP. CLI propose stays on `clawql sources add --kind cli` for CLI wrappers.

## Pending record

```json
{
  "version": 2,
  "proposalId": "psp_…",
  "entry": {
    "id": "…",
    "name": "…",
    "kind": "openapi",
    "addedAt": "…",
    "url": "…",
    "cachePath": "…"
  },
  "riskSummary": { "allow": 1, "mandate": 2, "block": 0, "total": 3 },
  "sampleOperations": [{ "id": "…", "method": "GET", "risk": { "policy": "allow" } }],
  "status": "pending",
  "createdAt": "ISO-8601",
  "expiresAt": "ISO-8601",
  "decidedAt": null,
  "proposedBy": "agent:mcp-session-id",
  "approvedBy": null
}
```

Default TTL: 72h (`CLAWQL_PENDING_SOURCE_TTL_HOURS`). Legacy v1 files without `proposedBy` cannot be approved (fail closed).

Operator identity: `CLAWQL_OPERATOR_ID` (preferred; never issued to agent sessions) or the OS username for local CLI (`operator:<id>`).

## Surfaces

| Surface                                      | Action                                                                |
| -------------------------------------------- | --------------------------------------------------------------------- |
| MCP `sources_propose`                        | Preview (`dryRun`) or park proposal (`agent:` principal)              |
| CLI `clawql sources propose <url>`           | Same as propose (`--commit` → `dryRun: false`, `operator:` principal) |
| CLI `clawql sources approve \| decline <id>` | Human gate (`operator:` principal; ≠ proposer)                        |
| Console / phone push (future)                | Same `approveSourceEffect` under operator credentials                 |

## Out of scope

- Dashboard UI / phone-push wire-up (same Effect core when added)
- Auto ATR rebind / `explicitWiderScopeGrant` (operators rebind separately if needed)
- ChatGPT elicitation wire-up
