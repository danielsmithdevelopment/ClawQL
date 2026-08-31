import type { WORMAppendInput, WORMAuditTrailService } from "clawql-audit";
import { Data, Effect } from "effect";

export class HarnessPluginError extends Data.TaggedError("HarnessPluginError")<{
  readonly pluginId: string;
  readonly reason: string;
  readonly cause?: unknown;
}> {}

export class HarnessNotStartedError extends Data.TaggedError("HarnessNotStartedError")<{
  readonly reason: string;
}> {}

export type ModelConfig = {
  readonly provider: string;
  readonly name: string;
  readonly baseUrl?: string;
  readonly apiKey?: string;
};

export type HarnessScope = {
  readonly toolsInScope: readonly string[];
  readonly toolsOutOfScope: readonly string[];
};

export type LoopPhase = "plan" | "act" | "observe" | "evaluate";

export type LoopHistoryEntry = {
  readonly phase: LoopPhase;
  readonly turn: number;
  readonly outputHash?: string;
  readonly ontologySnapshot?: string;
  readonly evalScore?: number;
  readonly note?: string;
};

export type LoopState = {
  readonly turn: number;
  readonly history: readonly LoopHistoryEntry[];
  readonly systemPromptAddendum?: string;
  readonly wonderTriggered?: boolean;
};

export type HarnessToolHandler = (
  args: Record<string, unknown>
) => Effect.Effect<unknown, HarnessPluginError, WORMAuditTrailService>;

export type HarnessTool = {
  readonly name: string;
  readonly description: string;
  /** Opaque Zod shape / JSON Schema fields for MCP bridge registration. */
  readonly inputSchema?: Record<string, unknown>;
  readonly handler: HarnessToolHandler;
};

export type HarnessContext = {
  readonly tools: {
    register(tool: HarnessTool): void;
  };
  readonly loop: {
    onPlan(handler: LoopHandler): void;
    onAct(handler: LoopHandler): void;
    onObserve(handler: LoopHandler): void;
    onEvaluate(handler: LoopHandler): void;
  };
  readonly worm: {
    append(
      entry: Omit<WORMAppendInput, "sessionId" | "timestamp"> & {
        readonly timestamp?: string;
      }
    ): Effect.Effect<void, HarnessPluginError, WORMAuditTrailService>;
  };
  readonly scope: {
    isInScope(toolName: string): boolean;
  };
  readonly session: {
    readonly id: string;
    readonly model: ModelConfig;
  };
};

export type LoopHandler = (
  state: LoopState
) => Effect.Effect<LoopState, HarnessPluginError, WORMAuditTrailService>;

export type HarnessPlugin = {
  readonly id: string;
  readonly version: string;
  readonly setup: (
    ctx: HarnessContext
  ) => Effect.Effect<void, HarnessPluginError, WORMAuditTrailService>;
  readonly teardown?: (
    ctx: HarnessContext
  ) => Effect.Effect<void, HarnessPluginError, WORMAuditTrailService>;
};

export type HarnessTask = {
  readonly id: string;
  readonly title: string;
  readonly maxTurns?: number;
  readonly atrScope?: HarnessScope;
};

export type HarnessRunResult = {
  readonly taskId: string;
  readonly turns: number;
  readonly finalState: LoopState;
  readonly registeredTools: readonly string[];
  readonly wormComplete: boolean;
};

export type ClawQLHarnessConfig = {
  readonly plugins: readonly HarnessPlugin[];
  readonly model: ModelConfig;
  readonly wormDbPath?: string;
  readonly sessionId?: string;
  readonly atrScope?: HarnessScope;
};

export type BenchmarkTask = HarnessTask;

export type HarnessComparisonArm = {
  readonly pluginId: string;
  readonly result: HarnessRunResult;
};

export type HarnessComparisonResult = {
  readonly baseline: HarnessRunResult;
  readonly plugins: readonly HarnessComparisonArm[];
};
