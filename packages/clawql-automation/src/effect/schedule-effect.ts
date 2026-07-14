/**
 * Native Effect.gen staging for schedule MCP tool:
 * parse → open DB → migrate → dispatch op → close.
 * No nested {@link runAutomationEffect}.
 */

import { Effect } from "effect";
import {
  dispatchScheduleOperation,
  getScheduleDatabasePath,
  openScheduleDatabase,
  parseScheduleToolInput,
  prepareScheduleDatabase,
} from "../schedule/schedule.js";
import { AutomationError } from "./automation-errors.js";
import { automationFromPromise, type McpTextResult } from "./automation-effect-utils.js";

/**
 * Schedule tool pipeline as Effect.gen.
 * Zod parse + sql.js open/dispatch stay behind {@link automationFromPromise} so rejection
 * semantics match the prior Promise façade (Zod → AutomationError via tryPromise).
 */
export function executeScheduleToolCoreEffect(
  params: unknown
): Effect.Effect<McpTextResult, AutomationError> {
  return Effect.gen(function* () {
    const parsed = yield* automationFromPromise(async () => parseScheduleToolInput(params));
    const absDbPath = getScheduleDatabasePath();
    const db = yield* automationFromPromise(() => openScheduleDatabase(absDbPath));
    yield* Effect.sync(() => prepareScheduleDatabase(db));

    return yield* automationFromPromise(() =>
      dispatchScheduleOperation(db, absDbPath, parsed)
    ).pipe(Effect.ensuring(Effect.sync(() => db.close())));
  });
}
