/**
 * Ontologiql / ClawQL coding-agent session runner over Agent Client Protocol.
 *
 * Thin orchestration on top of {@link AgentClientProtocol}: spike checklist
 * (initialize → authenticate → session/new → prompt → cancel/close).
 * Mandates / IFC / WORM stay on the ClawQL MCP plane — not reimplemented here.
 */
import { Context, Effect, Layer } from "effect";
import {
  AgentClientProtocol,
  makeAgentClientProtocolDuplexLayer,
  makeAgentClientProtocolLayer,
  type AcpDuplexConfig,
} from "../acp/client.js";
import type { AcpError } from "../acp/errors.js";
import type {
  AcpContentBlock,
  AcpInitializeResult,
  AcpMcpServerRef,
  AcpPromptResult,
  AcpSpawnConfig,
} from "../acp/types.js";

export type AcpRunnerTurnInput = {
  readonly cwd: string;
  readonly prompt: readonly AcpContentBlock[];
  readonly mcpServers?: readonly AcpMcpServerRef[];
  readonly additionalDirectories?: readonly string[];
  /** Auth method id; default `cursor_login` for Cursor CLI ACP. Pass null to skip. */
  readonly authenticateMethodId?: string | null;
};

export type AcpRunnerTurnResult = {
  readonly initialize: AcpInitializeResult;
  readonly sessionId: string;
  readonly prompt: AcpPromptResult;
};

export type CodingAgentRunnerApi = {
  /**
   * Full spike checklist turn: initialize → optional authenticate →
   * session/new → session/prompt → close.
   */
  readonly runTurn: (
    input: AcpRunnerTurnInput
  ) => Effect.Effect<AcpRunnerTurnResult, AcpError, AgentClientProtocol>;
};

export class CodingAgentRunner extends Context.Service<CodingAgentRunner, CodingAgentRunnerApi>()(
  "clawql/CodingAgentRunner"
) {}

export const runAcpSpikeTurnEffect = (
  input: AcpRunnerTurnInput
): Effect.Effect<AcpRunnerTurnResult, AcpError, AgentClientProtocol> =>
  Effect.gen(function* () {
    const acp = yield* AgentClientProtocol;
    const initialize = yield* acp.initialize();
    const authMethod =
      input.authenticateMethodId === undefined ? "cursor_login" : input.authenticateMethodId;
    if (authMethod) {
      yield* acp.authenticate(authMethod);
    }
    const session = yield* acp.newSession({
      cwd: input.cwd,
      mcpServers: input.mcpServers ?? [],
      additionalDirectories: input.additionalDirectories,
    });
    const prompt = yield* acp.prompt({
      sessionId: session.sessionId,
      prompt: input.prompt,
    });
    yield* acp.close();
    return {
      initialize,
      sessionId: session.sessionId,
      prompt,
    };
  });

export const CodingAgentRunnerLive = Layer.succeed(
  CodingAgentRunner,
  CodingAgentRunner.of({
    runTurn: runAcpSpikeTurnEffect,
  })
);

/** Spawn-backed ACP + runner (production Ontologiql path). */
export const makeCodingAgentRunnerLayer = (spawn: AcpSpawnConfig) =>
  Layer.merge(makeAgentClientProtocolLayer(spawn), CodingAgentRunnerLive);

/** Duplex/test ACP + runner. */
export const makeCodingAgentRunnerDuplexLayer = (config: AcpDuplexConfig) =>
  Layer.merge(makeAgentClientProtocolDuplexLayer(config), CodingAgentRunnerLive);

/**
 * ADR 0017 spike checklist — ordered steps a new agent integration must prove
 * on ACP before opening a native-adapter design.
 */
export const ACP_SPIKE_CHECKLIST = [
  "initialize",
  "authenticate",
  "session/new",
  "session/prompt",
  "session/request_permission (handler)",
  "session/cancel",
] as const;

export type AcpSpikeChecklistStep = (typeof ACP_SPIKE_CHECKLIST)[number];
