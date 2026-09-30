# MCP Events — ClawQL 8.0.0

**Status:** Implementation (8.0.0)  
**Package:** `clawql-mcp-events`  
**External:** [OpenAI MCP Events](https://developers.openai.com/plugins/build/mcp-events) (ChatGPT plugin; webhook delivery)  
**Prerequisite:** MCP protocol version `2026-07-28` (`server/discover`)

## 1. Purpose

Advertise `capabilities.events` and implement `events/list`, `events/subscribe`, and `events/unsubscribe` on the same authenticated MCP endpoint as tools. ClawQL turns existing internal signals into MCP Events so ChatGPT and other clients can subscribe via webhooks.

**Distinctive angle:** schedule synthetic HTTP polls with **projection-based** change detection emit `stream.changed`, so **any HTTPS API ClawQL can poll becomes an MCP event source** without native webhooks. Subscriptions name `watch_fields` (same idea as execute field projection), canonicalize before hashing, send conditional GETs when validators exist, include a capped diff in the event, and back off on upstream `429` / `Retry-After`. Full `clawql-streams` / agent wake loops remain follow-on.

## 2. Scope (8.0.0)

| In                                                                                        | Out (follow-on)                                       |
| ----------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Discover `events: {}` on HTTP + gRPC                                                      | Full `clawql-streams` / `stream_subscribe` agent loop |
| `events/list` · `subscribe` · `unsubscribe`                                               | Polling / streaming MCP delivery modes                |
| Webhook delivery + challenge (Standard Webhooks)                                          | `gap` / `terminated` control notifications            |
| Durable subscription store (JSON file)                                                    | Postgres-backed multi-replica store                   |
| Live event catalog (seven events)                                                         | Dynamic OpenAPI-derived event schemas                 |
| Schedule projection-hash → `stream.changed` (watch_fields, 304, capped diff, 429 backoff) | NATS / WebSocket native stream sources                |
| SSRF-hardened callbacks + enterprise allowlist / PII redact / caps                        | Custom connect-to-IP TLS agent (stretch)              |
| Access recheck + instruction screening + feedback-loop detector                           | Full Panguard ATR integration (host wires)            |
| WORM append hooks (optional host)                                                         | Mandatory dual-ack WORM                               |

## 3. Methods

Same authentication as tools. JSON-RPC methods:

- **`events/list`** — `{ cursor? }` → `{ events[], nextCursor? }`
- **`events/subscribe`** — `{ name, arguments, delivery: { mode: "webhook", url, secret }, cursor?, ttlMs? }` → `{ id, refreshBefore, cursor, truncated }`
- **`events/unsubscribe`** — `{ name, arguments, delivery: { mode, url } }` → `{}`

JSON-RPC error **`-32015`** (`CallbackEndpointError`) with `data.reason` (`challenge_failed` | `timeout` | `ssrf_blocked` | `allowlist_blocked` | `invalid_secret` | …) on callback failures.

## 4. Event catalog (advertised only with live producers)

Naming: `<noun>.<past-participle>`. Reserve `mandate.*` for fleet mandates if they ship later.

| Name                 | Description                                   | Producer (wired)                                                                                            | Filters                             |
| -------------------- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| `stream.changed`     | Polled synthetic topic **projection** changed | Schedule job run change-detection (`watch_fields` → hash + capped `diff`; `schedule` get for full snapshot) | `topic` (required; schedule job id) |
| `document.processed` | IDP / document pipeline finished              | `clawql-documents` IDP effect                                                                               | `document_id?`                      |
| `hook.blocked`       | Policy / ATR / hook blocked a call            | `src/mcp/mcp-tool-wrap.ts` blocked branch                                                                   | `tool?`                             |
| `budget.exhausted`   | Inference virtual-key budget exceeded         | `clawql-inference` `validateVirtualKey`                                                                     | `budget_id?`                        |
| `schedule.completed` | Schedule job run completed                    | `clawql-automation` `executeTriggerForJob`                                                                  | `schedule_id?`                      |
| `schedule.paused`    | Schedule synthetic poll paused (e.g. auth)    | `clawql-automation` auth-failure threshold → `emitSchedulePaused`                                           | `schedule_id?`, `reason?`           |
| `notification.sent`  | Slack notify success                          | `clawql-automation` notify effect                                                                           | `channel?`                          |

All support `delivery: ["webhook"]` only.

## 4b. Enterprise outbound controls

| Control                              | Env                                                               | Default                                                                 |
| ------------------------------------ | ----------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Callback host allowlist              | `CLAWQL_MCP_EVENTS_CALLBACK_ALLOWLIST` (comma hosts / `*.suffix`) | empty = any public HTTPS (enterprises should set OpenAI receiver hosts) |
| PII redaction                        | `CLAWQL_MCP_EVENTS_REDACT_PII`                                    | on — runs `gatewayRedactPayload` before delivery                        |
| Max subscriptions / principal        | `CLAWQL_MCP_EVENTS_MAX_SUBSCRIPTIONS_PER_PRINCIPAL`               | `25`                                                                    |
| Max deliveries / minute / principal  | `CLAWQL_MCP_EVENTS_MAX_DELIVERIES_PER_MINUTE_PER_PRINCIPAL`       | `60`                                                                    |
| Coalesce interval (`stream.changed`) | `CLAWQL_MCP_EVENTS_COALESCE_INTERVAL_MS`                          | `ceil(60000 / maxDeliveries)` (min 1s)                                  |
| Projection at-rest key               | `CLAWQL_SCHEDULE_PROJECTION_KEY` or `CLAWQL_SECRET_SCHEDULE_PROJECTION_KEY` (env / Vault) | **Required in production** (fail-closed). Dev-only: auto file beside DB |
| Auth-failure pause threshold         | `CLAWQL_SCHEDULE_AUTH_FAILURE_THRESHOLD`                          | `3`                                                                     |

## 4c. `stream.changed` precision (schedule)

False alarms from volatile fields (timestamps, request IDs, rate-limit counters, unstable array order) are avoided by:

1. **`action.synthetic_test.change_detection.watch_fields`** — project then hash (required for precise detection; omit only when whole-body-minus-defaults is acceptable).
2. **`exclude_paths` / `array_sort_keys` / canonical key order** before hashing.
3. **Conditional requests** — store `ETag` / `Last-Modified`; send `If-None-Match` / `If-Modified-Since` on GET (304 = no change).
4. **Capped `diff`** in the event payload (`added` / `removed` / `changed`, truncated); full projection via `schedule` get → `change_detection_state.last_projection` (screened + gateway-redacted + AES-256-GCM at rest; deleted when the schedule job is deleted or the `stream.changed` subscription for that `topic` ends).
5. **429 backoff** — honor `Retry-After` (default 60s) via `backoff_until`; polls use the subscriber’s credentials.
6. **Delivery coalescing** — per-subscription min interval (`CLAWQL_MCP_EVENTS_COALESCE_INTERVAL_MS`, default ≈ `ceil(60s / maxDeliveriesPerMinute)`) merges busy-feed changes into one event with a combined `diff` / `coalesced_count` instead of silently dropping under the delivery cap.
7. **Upstream auth pause** — after N consecutive `401`/`403` (default 3, `CLAWQL_SCHEDULE_AUTH_FAILURE_THRESHOLD`), auto-polls pause (`poll_pause_reason=upstream_auth`), emit **`schedule.paused`** (so automations can prompt re-auth), log + MCP `audit` ring (Evidence). ClawQL console lists paused jobs via `schedule` `list` + `paused_only: true` and clears the pause with **Reconnect sources** → `schedule` operation `reconnect` (clear pause + immediate re-poll). ChatGPT does not support `terminated` notices.

### Production projection keys

At-rest AES-256-GCM for schedule projections requires a key from the environment or Vault (`CLAWQL_SCHEDULE_PROJECTION_KEY` or `CLAWQL_SECRET_SCHEDULE_PROJECTION_KEY`). **Do not** keep the key beside the schedule database in production — anyone who copies that disk gets ciphertext and key together. When `NODE_ENV=production` / `CLAWQL_ENV=production|prod` (or `CLAWQL_SCHEDULE_PROJECTION_KEY_STRICT=1`), missing env/Vault key **fail-closes** schedule worker startup. Development may auto-generate a file-beside-DB key with a loud warning.

## 5. Subscription identity & durability

- Subscription ID = `sub_` + SHA-256 of canonical JSON `{ principal, url, name, arguments }` (first 32 hex chars).
- Idempotent create/refresh: same identity updates secret / TTL / cursor.
- Store path: `CLAWQL_MCP_EVENTS_STORE_PATH` or default `.clawql/mcp-events/subscriptions.json`.
- Survive restarts; drop expired rows on load/list.
- Default TTL: 24h (`CLAWQL_MCP_EVENTS_DEFAULT_TTL_MS`); `ttlMs: null` may grant non-expiring when policy allows.

## 6. Delivery security

1. Validate `whsec_` secret (base64 payload 24–64 bytes).
2. HTTPS only; block private/loopback/link-local; **do not follow redirects**.
3. Optional allowlist (`CLAWQL_MCP_EVENTS_CALLBACK_ALLOWLIST`).
4. Challenge: POST `{ type: "verification", challenge }` signed with Standard Webhooks; require `2xx` + echoed challenge before activating.
5. Cache successful verification by `(principal, url)` for a bounded window.
6. One event per request; body ≤ 256 KiB.
7. Headers: `webhook-id` (= `eventId`), `webhook-timestamp`, `webhook-signature`, `X-MCP-Subscription-Id`.
8. Retry with backoff; preserve `eventId`; **no retry** on `410` / `413`.
9. Recheck access for the life of the subscription; stop delivery if revoked.
10. Screen instruction-like wrappers; redact PII via gateway redaction before delivery.
11. Detect event → action → event feedback loops; per-principal delivery rate caps.
12. Append subscription + delivery outcomes to WORM when host provides a sink.

## 7. Enablement

- Default **on** (`CLAWQL_ENABLE_MCP_EVENTS` unset or truthy).
- Set `CLAWQL_ENABLE_MCP_EVENTS=0` to hide `capabilities.events` and reject event methods.
- Local/dev: `CLAWQL_MCP_EVENTS_ALLOW_LOCALHOST=1` relaxes private-address checks for challenge/delivery tests only.

## 8. Tests

- Package: subscribe/deliver/unsubscribe, challenge `-32015`, SSRF, allowlist, 410, revoke, feedback loop, **per-event producer → signed delivery**.
- Schedule: `detectProjectedChange` / `detectSyntheticBodyChange` baseline vs change; volatile-field immunity; capped diffs.
- **Blocking release gate:** ChatGPT live pass — [`mcp-events-chatgpt-checklist.md`](./mcp-events-chatgpt-checklist.md) and [`docs/release/v8.0.0-checklist.md`](../../release/v8.0.0-checklist.md).
