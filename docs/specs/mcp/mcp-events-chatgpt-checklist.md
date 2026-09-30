# MCP Events — ChatGPT live checklist

Run once against a ChatGPT plugin-connected ClawQL MCP server before 8.0.0 release.

**Prerequisite:** MCP protocol `2026-07-28`, `CLAWQL_ENABLE_MCP_EVENTS` not disabled, and (for enterprise) `CLAWQL_MCP_EVENTS_CALLBACK_ALLOWLIST` including ChatGPT receiver hosts.

## Checklist

1. [ ] Plugin page shows ClawQL **events** alongside tools after rescan.
2. [ ] `server/discover` returns `capabilities.events: {}`.
3. [ ] `events/list` returns the five live events only (no `stream.changed`).
4. [ ] New chat: ask ChatGPT to subscribe to `clawql.notification` (or another live event) and specify an action.
5. [ ] Server receives `events/subscribe`; challenge verification succeeds (`2xx` + echoed challenge).
6. [ ] Trigger the real producer (e.g. Slack `notify`, schedule tick, IDP pipeline, blocked tool, budget exceed).
7. [ ] Webhook delivery gets `2xx`; ChatGPT receives expected `data` and follows instructions.
8. [ ] Filtered subscription: trigger a non-matching event — **not** delivered.
9. [ ] Stop monitoring in ChatGPT → `events/unsubscribe` → further producers do not deliver.
10. [ ] With allowlist set, a non-allowlisted callback URL is rejected (`-32015` / `allowlist_blocked`).

## Protocol smoke (no ChatGPT UI)

```bash
# With MCP HTTP up and CLAWQL_MCP_EVENTS_ALLOW_LOCALHOST=1 for a local receiver:
npm run test -w clawql-mcp-events
```

Producer → signed delivery coverage lives in `packages/clawql-mcp-events/src/producers.test.ts`.

## Status

| Environment | Result |
| --- | --- |
| Package / producer E2E (this repo CI) | Automated — see vitest |
| Live ChatGPT plugin UI | **Operator-run** — requires OpenAI plugin credentials not available in Cloud Agent VMs |
