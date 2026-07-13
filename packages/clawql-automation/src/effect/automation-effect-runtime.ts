import { Cause, Effect, Exit, Layer } from "effect";
import type { NotifySlackInput } from "../notify/notify.js";
import { AutomationToolsService, automationToolsLiveLayer } from "./automation-tools-service.js";
import type { McpTextResult } from "./automation-effect-utils.js";

export type AutomationServices = AutomationToolsService;

/** Merged Effect Layer for clawql-automation domain services. */
export function automationServicesLiveLayer(): Layer.Layer<AutomationServices> {
  return automationToolsLiveLayer();
}

import { AutomationError } from "./automation-errors.js";

function throwAutomationFailure(cause: Cause.Cause<unknown>): never {
  const squashed = Cause.squash(cause);
  if (squashed instanceof AutomationError && squashed.cause != null) {
    if (squashed.cause instanceof Error) throw squashed.cause;
    throw new Error(String(squashed.cause));
  }
  throw squashed;
}

/** Run an automation Effect program with default services Layer. */
export async function runAutomationEffect<A, E>(
  program: Effect.Effect<A, E, AutomationServices>
): Promise<A> {
  const exit = await Effect.runPromiseExit(
    program.pipe(Effect.provide(automationServicesLiveLayer()))
  );
  if (Exit.isSuccess(exit)) {
    return exit.value;
  }
  throwAutomationFailure(exit.cause);
}

export function automationNotifyProgram(
  params: NotifySlackInput
): Effect.Effect<McpTextResult, unknown, AutomationServices> {
  return Effect.gen(function* () {
    const tools = yield* AutomationToolsService;
    return yield* tools.notify(params);
  });
}

export function automationScheduleProgram(
  params: unknown
): Effect.Effect<McpTextResult, unknown, AutomationServices> {
  return Effect.gen(function* () {
    const tools = yield* AutomationToolsService;
    return yield* tools.schedule(params);
  });
}

export function automationWorkflowProgram(
  params: unknown
): Effect.Effect<McpTextResult, unknown, AutomationServices> {
  return Effect.gen(function* () {
    const tools = yield* AutomationToolsService;
    return yield* tools.workflow(params);
  });
}

export function automationArgocdProgram(
  params: unknown
): Effect.Effect<McpTextResult, unknown, AutomationServices> {
  return Effect.gen(function* () {
    const tools = yield* AutomationToolsService;
    return yield* tools.argocd(params);
  });
}
