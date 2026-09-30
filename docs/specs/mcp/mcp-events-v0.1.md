# MCP Events — ClawQL 8.0.0

**Status:** Implementation (8.0.0)  
**Package:** `clawql-mcp-events`  
**External:** [OpenAI MCP Events](https://developers.openai.com/plugins/build/mcp-events) (ChatGPT plugin; webhook delivery)  
**Prerequisite:** MCP protocol version `2026-07-28` (`server/discover`)

## 1. Purpose

Advertise `capabilities.events` and implement `events/list`, `events/subscribe`, and `events/unsubscribe` on the same authenticated MCP endpoint as tools. ClawQL turns existing internal signals (stream/topic changes, document processed, hook blocked, budget exhausted, mandate completed) into MCP Events so ChatGPT and other clients can subscribe via webhooks.

**Distinctive angle:** most MCP servers emit events only from their own app. ClawQL can surface events from _any_ API it already wraps (including APIs without native webhooks) once Streams/poll sources feed the emitter.

## 2. Scope (8.0.0)

| In                                                                 | Out (follow-on)                                    |
| ------------------------------------------------------------------ | -------------------------------------------------- |
| Discover `events: {}` on HTTP + gRPC                               | Full `clawql-streams` / `stream_subscribe` package |
| `events/list` · `subscribe` · `unsubscribe`                        | Polling / streaming delivery modes                 |
| Webhook delivery + challenge (Standard Webhooks)                   | `gap` / `terminated` control notifications         |
| Durable subscription store (JSON file)                             | Postgres-backed multi-replica store                |
| Built-in event catalog                                             | Dynamic OpenAPI-derived event schemas              |
| SSRF-hardened callbacks (HTTPS, no redirects, private IPs blocked) | Custom connect-to-IP TLS agent (stretch)           |
| Access recheck hook + payload screening + feedback-loop detector   | Full Panguard ATR integration (host wires)         |
| WORM append hooks (optional host)                                  | Mandatory dual-ack WORM                            |

## 3. Methods

Same authentication as tools. JSON-RPC methods:

- **`events/list`** — `{ cursor? }` → `{ events[], nextCursor? }`
- **`events/subscribe`** — `{ name, arguments, delivery: { mode: "webhook", url, secret }, cursor?, ttlMs? }` → `{ id, refreshBefore, cursor, truncated }`
- **`events/unsubscribe`** — `{ name, arguments, delivery: { mode, url } }` → `{}`

JSON-RPC error **`-32015`** (`CallbackEndpointError`) with `data.reason` (`challenge_failed` | `timeout` | `ssrf_blocked` | `invalid_secret` | …) on callback failures.

## 4. Event catalog (built-in — advertised only when producers are live)

| Name                  | Description                           | Producer (wired)                                   | Filters        |
| --------------------- | ------------------------------------- | -------------------------------------------------- | -------------- |
| `document.processed`  | IDP / document pipeline finished      | `clawql-documents` IDP effect + NATS dispatch path | `document_id?` |
| `hook.blocked`        | Policy / ATR / hook blocked a call    | `src/mcp/mcp-tool-wrap.ts` blocked branch          | `tool?`        |
| `budget.exhausted`    | Inference virtual-key budget exceeded | `clawql-inference` `validateVirtualKey`            | `budget_id?`   |
| `mandate.completed`   | Schedule job run completed            | `clawql-automation` `executeTriggerForJob`         | `mandate_id?`  |
| `clawql.notification` | Slack notify success                  | `clawql-automation` notify effect                  | `channel?`     |

**Deferred (not in `events/list`):** `stream.changed` — requires `clawql-streams` / change-detection producers. Kept in `DEFERRED_MCP_EVENT_CATALOG` only.

All advertised events support `delivery: ["webhook"]` only.

## 4b. Enterprise outbound controls

| Control                             | Env                                                               | Default                                                                 |
| ----------------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Callback host allowlist             | `CLAWQL_MCP_EVENTS_CALLBACK_ALLOWLIST` (comma hosts / `*.suffix`) | empty = any public HTTPS (enterprises should set OpenAI receiver hosts) |
| PII redaction                       | `CLAWQL_MCP_EVENTS_REDACT_PII`                                    | on — runs `gatewayRedactPayload` before delivery                        |
| Max subscriptions / principal       | `CLAWQL_MCP_EVENTS_MAX_SUBSCRIPTIONS_PER_PRINCIPAL`               | `25`                                                                    |
| Max deliveries / minute / principal | `CLAWQL_MCP_EVENTS_MAX_DELIVERIES_PER_MINUTE_PER_PRINCIPAL`       | `60`                                                                    |

## 5. Subscription identity & durability

- Subscription ID = `sub_` + SHA-256 of canonical JSON `{ principal, url, name, arguments }` (first 32 hex chars).
- Idempotent create/refresh: same identity updates secret / TTL / cursor.
- Store path: `CLAWQL_MCP_EVENTS_STORE_PATH` or default `.clawql/mcp-events/subscriptions.json`.
- Survive restarts; drop expired rows on load/list.
- Default TTL: 24h (`CLAWQL_MCP_EVENTS_DEFAULT_TTL_MS`); `ttlMs: null` may grant non-expiring when policy allows.

## 6. Delivery security

1. Validate `whsec_` secret (base64 payload 24–64 bytes).
2. HTTPS only; block private/loopback/link-local; **do not follow redirects**.
3. Challenge: POST `{ type: "verification", challenge }` signed with Standard Webhooks; require `2xx` + echoed challenge (constant-time compare) before activating.
4. Cache successful verification by `(principal, url)` for a bounded window.
5. One event per request; body ≤ 256 KiB.
6. Headers: `webhook-id` (= `eventId`), `webhook-timestamp`, `webhook-signature`, `X-MCP-Subscription-Id`.
7. Retry with backoff; preserve `eventId`; fresh timestamp/signature each attempt; **no retry** on `410` / `413`.
8. Recheck access for the life of the subscription; stop delivery if revoked.
9. Screen payload user text as **data**, never instructions (strip/flag instruction-like wrappers).
10. Detect event → action → event feedback loops via recent delivery/action fingerprints.
11. Append subscription + delivery outcomes to WORM when host provides `WORMAuditTrailService`.

## 7. Enablement

- Default **on** (`CLAWQL_ENABLE_MCP_EVENTS` unset or truthy).
- Set `CLAWQL_ENABLE_MCP_EVENTS=0` to hide `capabilities.events` and reject event methods.
- Local/dev: `CLAWQL_MCP_EVENTS_ALLOW_LOCALHOST=1` relaxes private-address checks for challenge/delivery tests only.

## 8. Tests (OpenAI checklist coverage)

Repeated subscribe, expiry across restart, revoked access, invalid signature, duplicates, batching (single-event sends), feedback loop, challenge failure → `-32015`, SSRF block, 410/413 no-retry.
