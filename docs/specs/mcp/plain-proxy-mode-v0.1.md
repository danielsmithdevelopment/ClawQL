# Plain proxy mode — v0.1

**Status:** Implementation (ADR 0015 foundational)  
**Related:** [ADR 0015](../../adr/0015-program-mode-alongside-search-execute.md), [`docs/mcp/mcp-tools.md`](../../mcp/mcp-tools.md)

## 1. Purpose

Harnesses that bring their own code mode (or other catalog UX) need a **thin, policy-gated** path into ClawQL without being forced through ClawQL’s `search` → COMPLETE catalog discovery loop.

Plain proxy mode does **not** weaken the gateway. Calls still run the same gate / risk / redaction / budget / audit path as `execute`. The only product difference is an optional MCP tool name (`proxy_call`) that signals “I already know the `operationId`.”

## 2. Enablement

| Knob                            | Meaning                                                                                                               |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `CLAWQL_ENABLE_PLAIN_PROXY=1`   | Process-wide: register `proxy_call` for every connection.                                                             |
| `CLAWQL_PLAIN_PROXY_KEY_GROUPS` | Comma-separated key-group allowlist. When set, register `proxy_call` only if the authenticated key’s group is listed. |
| `CLAWQL_API_KEY_GROUP`          | Host-injected group for the current connection (same pattern as `CLAWQL_API_KEY_ID` for session keys).                |

Precedence:

1. If `CLAWQL_ENABLE_PLAIN_PROXY` is truthy → **on**.
2. Else if `CLAWQL_PLAIN_PROXY_KEY_GROUPS` is non-empty **and** `CLAWQL_API_KEY_GROUP` matches an entry (case-insensitive trim) → **on**.
3. Else → **off** (default).

Catalog COMPLETE / PARTIAL UX is unchanged for `search`. Plain proxy means clients call **`proxy_call`** (or bare `execute`) with known `operationId`s; they are not required to `search` first.

## 3. MCP tool: `proxy_call`

Thin alias of Core `execute` — same Zod/Effect input shape and same handler path.

| Arg           | Type     | Notes                                           |
| ------------- | -------- | ----------------------------------------------- |
| `operationId` | string   | Required                                        |
| `args`        | object   | Required                                        |
| `fields`      | string[] | Optional projection                             |
| `where`       | string   | Optional JMESPath filter (same caps as execute) |

Sessions / WORM should record the tool name as `proxy_call` so operators can distinguish harness traffic from native `execute` while policy remains identical.

## 4. Non-goals (v0.1)

- Hiding `search` / `execute` from the tool list.
- Skipping gate, risk, redaction, mandates, or audit.
- Cross-key-group enablement without an explicit allowlist entry.
- Replacing program mode (`execute_program`) — that remains a separate ADR 0015 rollout step.

## 5. Tests

- Unit: enablement matrix (`CLAWQL_ENABLE_PLAIN_PROXY`, key-group allowlist hit/miss).
- Integration: `proxy_call` appears in `_registeredTools` / `listTools` only when enabled.
