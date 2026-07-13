import { Context, Effect, Layer } from "effect";
import type { NotifySlackInput } from "../notify/notify.js";
import { AutomationError } from "./automation-errors.js";
import type { McpTextResult } from "./automation-effect-utils.js";
import {
  executeArgocdToolEffect,
  executeNotifySlackEffect,
  executeScheduleToolEffect,
  executeWorkflowToolEffect,
} from "./automation-tools-effect.js";

/** Effect service for automation MCP tools (notify, schedule, workflow, argocd). */
export class AutomationToolsService extends Context.Tag("clawql/AutomationToolsService")<
  AutomationToolsService,
  {
    readonly notify: (params: NotifySlackInput) => Effect.Effect<McpTextResult, AutomationError>;
    readonly schedule: (params: unknown) => Effect.Effect<McpTextResult, AutomationError>;
    readonly workflow: (params: unknown) => Effect.Effect<McpTextResult, AutomationError>;
    readonly argocd: (params: unknown) => Effect.Effect<McpTextResult, AutomationError>;
  }
>() {}

export function automationToolsLiveLayer(): Layer.Layer<AutomationToolsService> {
  return Layer.succeed(
    AutomationToolsService,
    AutomationToolsService.of({
      notify: executeNotifySlackEffect,
      schedule: executeScheduleToolEffect,
      workflow: executeWorkflowToolEffect,
      argocd: executeArgocdToolEffect,
    })
  );
}
