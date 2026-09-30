# Changelog

## Unreleased

- Rename public event names before lock-in: `mandate.completed` → `schedule.completed`, `clawql.notification` → `notification.sent`.
- Advertise + wire `stream.changed` via schedule **projection-based** change detection (`watch_fields`, canonicalize, conditional GET / 304, capped `diff`, 429/`Retry-After` backoff).
- Projection snapshots: screen + gateway redact + AES-256-GCM at rest; delete on schedule delete / `stream.changed` unsubscribe.
- Per-subscription coalesce interval merges busy-feed diffs instead of dropping under the delivery cap.
- Consecutive upstream `401`/`403` pauses auto-polls, emits **`schedule.paused`**, and surfaces via console + MCP `audit` (Evidence). ClawQL console: `schedule` `list` + `paused_only` + operation **`reconnect`** (Reconnect sources).
- Production projection keys: require `CLAWQL_SCHEDULE_PROJECTION_KEY` / `CLAWQL_SECRET_SCHEDULE_PROJECTION_KEY` (env/Vault); fail-closed — never file-beside-DB in production.
- ChatGPT live pass is a **blocking** v8.0.0 release gate (`docs/release/v8.0.0-checklist.md`); checklist requires real trigger + delivery for all seven events (`stream.changed` precision/negative, `schedule.paused` + Reconnect sources).
- Drop vapor / wire live producers; enterprise allowlist, PII redact, caps.

## 0.1.0

First public release — MCP Events for ClawQL 8.0.0.

- `events/list`, `events/subscribe`, `events/unsubscribe` (webhook delivery)
- Standard Webhooks signing + callback challenge verification
- SSRF-hardened HTTPS callbacks (no redirects, private addresses blocked)
- Durable JSON subscription store; deterministic subscription IDs
- Live catalog: `stream.changed`, `document.processed`, `hook.blocked`, `budget.exhausted`, `schedule.completed`, `schedule.paused`, `notification.sent`
- Access recheck, payload screening, feedback-loop detection hooks
- Effect `McpEventsService` Tag + Layer
