# Sources propose (v0.1)

Depends on [operation risk from the spec](./operation-risk-from-spec-v0.1.md). Agents may **propose** a custom source; humans **approve** before `sources.json` changes.

## Flow

1. Agent calls MCP `sources_propose` with a URL (+ optional `name` / `kind` / `id`).
2. ClawQL fetches (SSRF-safe), detects kind, caches the body under `$CLAWQL_HOME/sources/<id>/`, loads operations, and classifies risk via `applyOperationRiskToLoadedOps`.
3. **`dryRun: true` (default)** — return a preview JSON (kind, op counts by risk policy, sample ops). **Does not** write `sources.json` or park a proposal.
4. **`dryRun: false`** — same preview **and** park a proposal under `$CLAWQL_HOME/pending-sources/` with `proposalId` (`psp_…`). WORM: `HUMAN_DECISION_REQUESTED`.
5. Human approves: CLI `clawql sources approve <proposalId>` or MCP `sources_approve` `{ proposalId, decision: "approve" }`:
   - `upsertCustomSource` + `resetSpecCache`
   - WORM: `HUMAN_APPROVAL`
   - Proposal marked `approved`
6. Decline: CLI `clawql sources decline <proposalId>` or `decision: "decline"` → WORM `HUMAN_REJECTION`; status `declined`.

## Guardrails

- Propose **never** sets `trusted: true` (MCP annotations stay ignored until an operator marks trust).
- Propose **never** widens ATR / session catalog by itself — approve only adds the source; next `loadSpec` indexes ops.
- URL fetch uses the existing SSRF chokepoint (`assertSafeSourceFetchUrl`).
- v0.1 URL kinds: OpenAPI / Discovery / GraphQL / gRPC / MCP / WebMCP. CLI propose stays on `clawql sources add --kind cli`.

## Pending record

```json
{
  "version": 1,
  "proposalId": "psp_…",
  "entry": { "id": "…", "name": "…", "kind": "openapi", "addedAt": "…", "url": "…", "cachePath": "…" },
  "riskSummary": { "allow": 1, "mandate": 2, "block": 0, "total": 3 },
  "sampleOperations": [{ "id": "…", "method": "GET", "risk": { "policy": "allow", "…" } }],
  "status": "pending",
  "createdAt": "ISO-8601",
  "expiresAt": "ISO-8601",
  "decidedAt": null
}
```

Default TTL: 72h (`CLAWQL_PENDING_SOURCE_TTL_HOURS`).

## Surfaces

| Surface                                      | Action                                         |
| -------------------------------------------- | ---------------------------------------------- |
| MCP `sources_propose`                        | Preview (`dryRun`) or park proposal            |
| MCP `sources_approve`                        | `{ proposalId, decision: approve\|decline }`   |
| CLI `clawql sources propose <url>`           | Same as propose (`--commit` → `dryRun: false`) |
| CLI `clawql sources approve \| decline <id>` | Human gate                                     |

## Out of scope

- Agent self-approve
- Dashboard UI
- Auto ATR rebind / `explicitWiderScopeGrant` (operators rebind separately if needed)
- ChatGPT elicitation wire-up
