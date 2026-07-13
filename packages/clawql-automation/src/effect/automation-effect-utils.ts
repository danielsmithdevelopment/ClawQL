import { Effect } from "effect";
import { AutomationError } from "./automation-errors.js";

export type McpTextResult = { content: { type: "text"; text: string }[] };

/** Lift a Promise into Effect with {@link AutomationError} on failure. */
export function automationFromPromise<A>(
  tryFn: () => Promise<A>
): Effect.Effect<A, AutomationError> {
  return Effect.tryPromise({
    try: tryFn,
    catch: (cause) =>
      new AutomationError({
        reason: "automation async operation failed",
        cause,
      }),
  });
}
