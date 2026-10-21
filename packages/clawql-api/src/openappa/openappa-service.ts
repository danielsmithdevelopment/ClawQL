import { Context, Effect, Layer } from "effect";
import {
  loadOpenAppaConfigEffect,
  openAppaEnabledEffect,
  openAppaWireToolNameEffect,
  type OpenAppaConfig,
} from "./config.js";
import {
  openAppaAfterToolResultEffect,
  openAppaBeforeToolCallEffect,
  type OpenAppaAfterResultInput,
  type OpenAppaAfterResultVerdict,
  type OpenAppaBeforeCallInput,
} from "./gate.js";
import type { OpenAppaGateVerdict } from "./types.js";

export type OpenAppaServiceApi = {
  readonly enabled: () => Effect.Effect<boolean>;
  readonly loadConfig: () => Effect.Effect<OpenAppaConfig | null>;
  readonly wireToolName: (toolName: string, mcpServer: string) => Effect.Effect<string>;
  readonly beforeToolCall: (
    input: OpenAppaBeforeCallInput
  ) => Effect.Effect<OpenAppaGateVerdict, never>;
  readonly afterToolResult: (
    input: OpenAppaAfterResultInput
  ) => Effect.Effect<OpenAppaAfterResultVerdict, never>;
};

/** Layer 5 — OpenAPPA information-flow policy (beside Panguard Layer 4). */
export class OpenAppaService extends Context.Service<OpenAppaService, OpenAppaServiceApi>()(
  "clawql/OpenAppaService"
) {}

export const OpenAppaLive: Layer.Layer<OpenAppaService> = Layer.succeed(
  OpenAppaService,
  OpenAppaService.of({
    enabled: () => openAppaEnabledEffect(),
    loadConfig: () => loadOpenAppaConfigEffect(),
    wireToolName: (toolName, mcpServer) => openAppaWireToolNameEffect(toolName, mcpServer),
    beforeToolCall: (input) => openAppaBeforeToolCallEffect(input),
    afterToolResult: (input) => openAppaAfterToolResultEffect(input),
  })
);
