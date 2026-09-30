# MCP Events — ChatGPT live checklist (**blocking** for v8.0.0)

This pass is a **hard release gate**. Do **not** tag or publish `clawql-mcp@8.0.0` until every box below is checked against a ChatGPT plugin-connected ClawQL MCP server.

**Prerequisite:** MCP protocol `2026-07-28`, `CLAWQL_ENABLE_MCP_EVENTS` not disabled, and (for enterprise) `CLAWQL_MCP_EVENTS_CALLBACK_ALLOWLIST` including ChatGPT receiver hosts.

## Blocking checklist

1. [ ] Plugin page shows ClawQL **events** alongside tools after rescan.
2. [ ] `server/discover` returns `capabilities.events: {}`.
3. [ ] `events/list` returns all seven live events: `stream.changed`, `document.processed`, `hook.blocked`, `budget.exhausted`, `schedule.completed`, `schedule.paused`, `notification.sent` (no `mandate.completed` / `clawql.notification`).
4. [ ] New chat: ask ChatGPT to subscribe to `notification.sent` (or another live event) and specify an action.
5. [ ] Server receives `events/subscribe`; challenge verification succeeds (`2xx` + echoed challenge).
6. [ ] Trigger the real producer (Slack `notify`, schedule tick with body change for `stream.changed`, IDP pipeline, blocked tool, or budget exceed).
7. [ ] Webhook delivery gets `2xx`; ChatGPT receives expected `data` and follows instructions.
8. [ ] Filtered subscription: trigger a non-matching event — **not** delivered.
9. [ ] Stop monitoring in ChatGPT → `events/unsubscribe` → further producers do not deliver.
10. [ ] With allowlist set, a non-allowlisted callback URL is rejected (`-32015` / `allowlist_blocked`).
11. [ ] `stream.changed`: schedule a synthetic poll with `change_detection.watch_fields`, change a watched field between ticks (volatile-only churn must not fire), confirm ChatGPT receives the event with a capped `diff` for that job `topic`.

## Protocol smoke (CI — not a substitute for this gate)

```bash
npm run test -w clawql-mcp-events
npm run test -w clawql-automation -- packages/clawql-automation/src/schedule/schedule-change-detect.test.ts
```

Producer → signed delivery coverage: `packages/clawql-mcp-events/src/producers.test.ts`.

## Sign-off

| Field                       | Value       |
| --------------------------- | ----------- |
| Operator                    |             |
| Date (UTC)                  |             |
| ClawQL MCP version / commit |             |
| ChatGPT plugin / workspace  |             |
| Result                      | PASS / FAIL |
| Notes                       |             |
