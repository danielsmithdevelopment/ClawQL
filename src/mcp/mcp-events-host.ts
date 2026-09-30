/**
 * Host boot wiring for MCP Events process emitter (used by package producers).
 */

import { Effect } from "effect";
import {
  isMcpEventsEnabledSync,
  McpEventsService,
  McpEventsServiceLive,
  setMcpEventsProcessEmitter,
  setStreamTopicReleasedHandler,
  type DeliverableEvent,
} from "clawql-mcp-events";

/** Register process-global emit used by document/hook/budget/mandate/notify producers. */
export function configureMcpEventsProcessEmitter(): void {
  if (!isMcpEventsEnabledSync()) {
    setMcpEventsProcessEmitter(null);
    setStreamTopicReleasedHandler(null);
    return;
  }
  setMcpEventsProcessEmitter(async (event: DeliverableEvent) =>
    Effect.runPromise(
      Effect.gen(function* () {
        const svc = yield* McpEventsService;
        return yield* svc.emit(event);
      }).pipe(Effect.provide(McpEventsServiceLive))
    )
  );
  setStreamTopicReleasedHandler(async (topic) => {
    try {
      const { clearScheduleProjectionForTopic } = await import(
        "clawql-automation/schedule/schedule"
      );
      await clearScheduleProjectionForTopic(topic);
    } catch {
      /* schedule optional */
    }
  });
}
