/**
 * Session-scope lifecycle hooks — fire session-start / session-end via fireHook.
 */

import {
  atrScopeFromTokens,
  fireHooksForEvent,
  WormAuditSink,
  type HookRegistry,
  type LifecycleEvent,
} from "clawql-core";
import type { Context } from "effect";
import { Effect } from "effect";

export type SessionLifecycleOptions = {
  readonly hookRegistry: Context.Tag.Service<typeof HookRegistry>;
  readonly worm: Context.Tag.Service<typeof WormAuditSink>;
  readonly sessionId: string;
  readonly atrScopeTokens?: readonly string[];
};

function fireSessionEvent(
  event: Extract<LifecycleEvent, "session-start" | "session-end">,
  options: SessionLifecycleOptions
): Effect.Effect<void, never> {
  return Effect.gen(function* () {
    const listed = yield* options.hookRegistry.list(event);
    if (listed.length === 0) return;
    yield* fireHooksForEvent(
      listed,
      {
        session: {
          id: options.sessionId,
          atrScope: atrScopeFromTokens(options.atrScopeTokens ?? []),
        },
      },
      { stopOnDeny: false }
    ).pipe(
      Effect.provideService(WormAuditSink, options.worm),
      Effect.catchAll(() => Effect.void)
    );
  });
}

/** Fire `session-start` hooks (non-blocking aggregate — denials are logged via WORM only). */
export function fireSessionStartEffect(
  options: SessionLifecycleOptions
): Effect.Effect<void, never> {
  return fireSessionEvent("session-start", options);
}

/** Fire `session-end` hooks when an MCP HTTP session closes. */
export function fireSessionEndEffect(
  options: SessionLifecycleOptions
): Effect.Effect<void, never> {
  return fireSessionEvent("session-end", options);
}

export async function fireSessionStart(options: SessionLifecycleOptions): Promise<void> {
  await Effect.runPromise(fireSessionStartEffect(options));
}

export async function fireSessionEnd(options: SessionLifecycleOptions): Promise<void> {
  await Effect.runPromise(fireSessionEndEffect(options));
}
