/**
 * Domain → process WORM mappers. No dependency on clawql-auth types.
 */

import { Effect } from "effect";
import type { WORMAppendInput, WORMEntry, WORMEntryType } from "./entry.js";
import { appendProcessWormEffect } from "./process-worm.js";

export type AuthWormEvent = {
  type: string;
  timestamp: string;
  [key: string]: unknown;
};

export const wormInputFromAuthEvent = (event: AuthWormEvent): Effect.Effect<WORMAppendInput> =>
  Effect.sync(() => {
    const { type, timestamp, ...rest } = event;
    return {
      type: type as WORMEntryType,
      timestamp,
      sessionId: "",
      metadata: { source: "auth", ...rest },
    };
  });

export const appendAuthEventToWormEffect = (
  event: AuthWormEvent
): Effect.Effect<WORMEntry | null> =>
  Effect.gen(function* () {
    const input = yield* wormInputFromAuthEvent(event);
    return yield* appendProcessWormEffect(input);
  });

/** Host AuthEventSink — inject alongside clawql-auth SQLite WORM. */
export function createAuthEventWormSink(): (event: AuthWormEvent) => Promise<void> {
  return async (event) => {
    await Effect.runPromise(appendAuthEventToWormEffect(event));
  };
}
