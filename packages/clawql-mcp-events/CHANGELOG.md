# Changelog

## Unreleased

- Drop `stream.changed` from advertised catalog until Streams producers exist (deferred catalog only).
- Wire live producers: `document.processed`, `hook.blocked`, `budget.exhausted`, `mandate.completed`, `clawql.notification`.
- Enterprise controls: callback allowlist, gateway PII redaction on payloads, per-principal subscription + delivery-rate caps.
- Per-event producer → signed delivery tests; ChatGPT live checklist doc.

## 0.1.0

First public release — MCP Events for ClawQL 8.0.0.

- `events/list`, `events/subscribe`, `events/unsubscribe` (webhook delivery)
- Standard Webhooks signing + callback challenge verification
- SSRF-hardened HTTPS callbacks (no redirects, private addresses blocked)
- Durable JSON subscription store; deterministic subscription IDs
- Built-in catalog (live producers): `document.processed`, `hook.blocked`, `budget.exhausted`, `mandate.completed`, `clawql.notification`
- Access recheck, payload screening, feedback-loop detection hooks
- Effect `McpEventsService` Tag + Layer
