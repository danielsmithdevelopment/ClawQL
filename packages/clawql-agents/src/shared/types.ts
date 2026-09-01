import type { AuditError } from "clawql-audit";
import { WORMAuditTrailService } from "clawql-audit";
import { Context, Effect, Layer } from "effect";

export type AgentWormError = AuditError;

export type AgentName = "openclaw" | "hermes" | "pi" | "goose" | "deepseek" | "openhands" | "cline";

export type ClawQLAgentConfig = {
  readonly mcpEndpoint: string;
  readonly wormDbPath: string;
  readonly inferenceEndpoint: string;
  readonly virtualKeyId: string;
  readonly teeEnabled: boolean;
};

export type ATRScope = {
  readonly toolsInScope: readonly string[];
  readonly toolsOutOfScope: readonly string[];
  readonly budget: {
    readonly maxTokens: number;
    readonly maxUsd: number;
    readonly maxTurns: number;
  };
  readonly sessionTtl: number;
};

export type AgentSession = {
  readonly sessionId: string;
  readonly agent: AgentName;
  readonly startedAt: string;
};

export type AgentHealth = {
  readonly status: "healthy" | "degraded" | "down";
  readonly details: string;
};

export class AgentAdapter extends Context.Tag("clawql/AgentAdapter")<
  AgentAdapter,
  {
    readonly name: AgentName;
    readonly version: string;
    readonly initialize: (config: ClawQLAgentConfig) => Effect.Effect<void>;
    readonly start: (
      atrScope: ATRScope
    ) => Effect.Effect<AgentSession, AgentWormError, WORMAuditTrailService>;
    readonly stop: (
      session: AgentSession
    ) => Effect.Effect<void, AgentWormError, WORMAuditTrailService>;
    readonly health: () => Effect.Effect<AgentHealth, AuditError, WORMAuditTrailService>;
  }
>() {}

export const AgentAdapterLive = (impl: Context.Tag.Service<typeof AgentAdapter>) =>
  Layer.succeed(AgentAdapter, impl);
