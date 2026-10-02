# Operation risk from the spec (v0.1)

Every imported operation gets a **risk** classification at load time. Agents see it in `search` before calling, and in the `execute` refusal when policy blocks the call.

## Policies

| Policy | Risk level | Meaning |
|--------|------------|---------|
| `allow` | `LOW` | Execute may proceed without a mandate |
| `mandate` | `MEDIUM` | Execute refuses with `mandate_required` until a future pause/resume path supplies approval |
| `block` | `HIGH` | Execute refuses with `blocked` unless an operator allowlists the operation |

## Spec defaults

| Source | Allow | Mandate | Block |
|--------|-------|---------|-------|
| OpenAPI / Discovery | `GET`, `HEAD` | `POST`, `PUT`, `PATCH` | `DELETE` |
| GraphQL | `QUERY` | `MUTATION` | — |
| gRPC | methods with `idempotency_level = NO_SIDE_EFFECTS` | all other unary RPCs | — |
| MCP (trusted only) | `readOnlyHint` | no hint / ambiguous | `destructiveHint` |
| MCP (untrusted) | — | **always** (annotations ignored) | — |
| CLI / WebMCP / unknown | — | **always** | — |

**Unknown never allows.** Ambiguous or missing signal → `mandate`.

## MCP trust

`readOnlyHint` / `destructiveHint` are self-attested. Honor them only when the MCP source id is trusted via:

1. `sources.json` entry `trusted: true`, or
2. `CLAWQL_MCP_TRUSTED_SOURCES` (comma-separated ids), or
3. `trustedMcpSources` in `~/.ClawQL/operation-risk.json`

Otherwise treat as unknown → `mandate`.

## Overrides

File: `$CLAWQL_HOME/operation-risk.json` (default `~/.ClawQL/operation-risk.json`).

```json
{
  "version": 1,
  "trustedMcpSources": ["local-stdio-tools"],
  "overrides": {
    "github::searchIssues": {
      "policy": "allow",
      "level": "LOW",
      "reason": "GitHub search uses POST but is read-only"
    }
  }
}
```

Changing an operation's risk is a **capability change**. Every applied override is appended to the process WORM log (`OPERATION_RISK_OVERRIDE`).

`/decision` may later *suggest* a risk for ambiguous POSTs; suggestions never auto-downgrade — a person must write the override.

## Surfaces

1. **`search`** — each operation result includes `risk: { level, policy, source, reason }`.
2. **`execute`** — on `mandate` / `block`, returns JSON with `ok: false`, `status`, `operationId`, and the same `risk` object (no upstream call).

## Out of scope (later)

- Pause-and-resume after mandate (`#2`)
- `sources_propose` (`#3`) — will classify ops on arrival using this module
