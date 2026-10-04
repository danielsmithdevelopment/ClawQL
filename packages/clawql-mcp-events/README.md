# clawql-mcp-events

MCP Events for ClawQL — `events/list`, `events/subscribe`, `events/unsubscribe` with Standard Webhooks delivery (ChatGPT MCP Events / protocol `2026-07-28`), plus the HTTP `/events` door on `clawql-inference` (catalog, subscriptions, SSE CloudEvents, inbound webhooks). **One catalog, one store.**

See [`docs/specs/mcp/mcp-events-v0.1.md`](../../docs/specs/mcp/mcp-events-v0.1.md) and [`docs/specs/inference/gateway-ladder-v0.1.md`](../../docs/specs/inference/gateway-ladder-v0.1.md).

```typescript
import { Effect } from "effect";
import { McpEventsService, McpEventsServiceLive } from "clawql-mcp-events";

const listed = await Effect.runPromise(
  Effect.gen(function* () {
    const svc = yield* McpEventsService;
    return yield* svc.list({});
  }).pipe(Effect.provide(McpEventsServiceLive))
);
```

**Enable:** on by default. Set `CLAWQL_ENABLE_MCP_EVENTS=0` to disable.
