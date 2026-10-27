/**
 * Combined Ontologiql / ClawQL coding-agent drive surface (ADR 0015 + 0017).
 *
 * One entry point that:
 * 1. Resolves ACP vs native ({@link resolveCodingAgentRouteEffect})
 * 2. Runs an ACP spike turn **or** starts a native adapter session
 * 3. Optionally dual-writes SESSION_* to the same WORM trail Agent SDK hooks use
 *
 * Mandates / IFC / execute stay on ClawQL MCP — this module only drives the
 * coding-agent session plane.
 */
import type { AuditError } from "clawql-audit";
import { WORMAuditTrailService, type WORMEntry } from "clawql-audit";
import { Context, Effect, Layer } from "effect";
import { AgentClientProtocol, type AcpDuplexConfig } from "../acp/client.js";
import type { AcpError } from "../acp/errors.js";
import { getAdapterBundle } from "../get-adapter.js";
import {
  AgentAdapter,
  type AgentWormError,
  type ATRScope,
  type AgentSession,
  type ClawQLAgentConfig,
} from "../shared/types.js";
import { makeAgentWormLayer } from "../shared/worm.js";
import {
  CodingAgentRunner,
  makeCodingAgentRunnerDuplexLayer,
  makeCodingAgentRunnerLayer,
  type AcpRunnerTurnInput,
  type AcpRunnerTurnResult,
} from "./acp-session.js";
import {
  resolveCodingAgentRouteEffect,
  type CodingAgentRoute,
  type ResolveCodingAgentRouteInput,
} from "./route.js";

export type DriveAcpTurnInput = ResolveCodingAgentRouteInput & {
  readonly turn: AcpRunnerTurnInput;
  /** When true (default), append SESSION_START / SESSION_END to WORM. */
  readonly wormLifecycle?: boolean;
};

export type DriveNativeStartInput = ResolveCodingAgentRouteInput & {
  readonly config: ClawQLAgentConfig;
  readonly atrScope: ATRScope;
};

export type DriveAcpTurnResult = {
  readonly route: Extract<CodingAgentRoute, { kind: "acp" }>;
  readonly turn: AcpRunnerTurnResult;
  readonly worm?: { readonly start?: WORMEntry; readonly end?: WORMEntry };
};

export type DriveNativeStartResult = {
  readonly route: Extract<CodingAgentRoute, { kind: "native" }>;
  readonly session: AgentSession;
};

export type PreparedCodingAgentStack = {
  readonly route: CodingAgentRoute;
  /** ACP stacks include {@link AgentClientProtocol}; native stacks include {@link AgentAdapter}. */
  readonly layer: Layer.Layer<
    | CodingAgentDrive
    | CodingAgentRunner
    | AgentClientProtocol
    | AgentAdapter
    | WORMAuditTrailService,
    unknown,
    never
  >;
};

export type CodingAgentDriveApi = {
  readonly resolve: (input: ResolveCodingAgentRouteInput) => Effect.Effect<CodingAgentRoute>;
  readonly runAcpTurn: (
    input: DriveAcpTurnInput
  ) => Effect.Effect<
    DriveAcpTurnResult,
    AcpError | AuditError,
    CodingAgentRunner | AgentClientProtocol | WORMAuditTrailService
  >;
  readonly startNative: (
    input: DriveNativeStartInput
  ) => Effect.Effect<DriveNativeStartResult, AgentWormError, AgentAdapter | WORMAuditTrailService>;
};

export class CodingAgentDrive extends Context.Service<CodingAgentDrive, CodingAgentDriveApi>()(
  "clawql/CodingAgentDrive"
) {}

const appendAcpLifecycle = (
  type: "SESSION_START" | "SESSION_END",
  sessionId: string,
  route: Extract<CodingAgentRoute, { kind: "acp" }>,
  metadata?: Record<string, unknown>
) =>
  Effect.gen(function* () {
    const worm = yield* WORMAuditTrailService;
    return yield* worm.append({
      type,
      timestamp: new Date().toISOString(),
      sessionId,
      agentName: `acp:${route.id}`,
      metadata: {
        plane: "ontologiql-runner",
        routeKind: "acp",
        reason: route.reason,
        spawnCommand: route.spawn.command,
        ...metadata,
      },
    });
  });

export const runCombinedAcpTurnEffect = (
  input: DriveAcpTurnInput
): Effect.Effect<
  DriveAcpTurnResult,
  AcpError | AuditError,
  CodingAgentRunner | AgentClientProtocol | WORMAuditTrailService
> =>
  Effect.gen(function* () {
    const route = yield* resolveCodingAgentRouteEffect(input);
    if (route.kind !== "acp") {
      return yield* Effect.die(
        new Error(
          `runAcpTurn requires an ACP route; resolved native (${route.agent}). Use startNative or an ACP target.`
        )
      );
    }
    const runner = yield* CodingAgentRunner;
    const wormLifecycle = input.wormLifecycle !== false;
    const turn = yield* runner.runTurn(input.turn);
    let start: WORMEntry | undefined;
    let end: WORMEntry | undefined;
    if (wormLifecycle) {
      start = yield* appendAcpLifecycle("SESSION_START", turn.sessionId, route, {
        stopReason: turn.prompt.stopReason,
        agentInfo: turn.initialize.agentInfo,
      });
      end = yield* appendAcpLifecycle("SESSION_END", turn.sessionId, route, {
        stopReason: turn.prompt.stopReason,
      });
    }
    return {
      route,
      turn,
      worm: wormLifecycle ? { start, end } : undefined,
    };
  });

export const startCombinedNativeEffect = (
  input: DriveNativeStartInput
): Effect.Effect<DriveNativeStartResult, AgentWormError, AgentAdapter | WORMAuditTrailService> =>
  Effect.gen(function* () {
    const route = yield* resolveCodingAgentRouteEffect({
      ...input,
      preferAcp: false,
      forceNative: input.target.kind === "auto" ? true : input.forceNative,
    });
    if (route.kind !== "native") {
      return yield* Effect.die(
        new Error(`startNative requires a native route; got ACP (${route.id})`)
      );
    }
    const adapter = yield* AgentAdapter;
    yield* adapter.initialize(input.config);
    const session = yield* adapter.start(input.atrScope);
    return { route, session };
  });

export const CodingAgentDriveLive = Layer.succeed(
  CodingAgentDrive,
  CodingAgentDrive.of({
    resolve: resolveCodingAgentRouteEffect,
    runAcpTurn: runCombinedAcpTurnEffect,
    startNative: startCombinedNativeEffect,
  })
);

/** ACP duplex (tests) + runner + drive + WORM. */
export const makeOntologiqlAcpDuplexStackLayer = (duplex: AcpDuplexConfig, wormDbPath: string) =>
  Layer.mergeAll(
    makeCodingAgentRunnerDuplexLayer(duplex),
    CodingAgentDriveLive,
    makeAgentWormLayer(wormDbPath)
  );

/** Spawn-backed ACP + runner + drive + WORM (production Ontologiql path). */
export const makeOntologiqlAcpStackLayer = (
  route: Extract<CodingAgentRoute, { kind: "acp" }>,
  wormDbPath: string
) =>
  Layer.mergeAll(
    makeCodingAgentRunnerLayer(route.spawn),
    CodingAgentDriveLive,
    makeAgentWormLayer(wormDbPath)
  );

/**
 * Resolve then build the appropriate Layer (ACP spawn or native adapter + WORM + drive).
 */
export const prepareCodingAgentStackEffect = (
  input: ResolveCodingAgentRouteInput
): Effect.Effect<PreparedCodingAgentStack> =>
  Effect.gen(function* () {
    const route = yield* resolveCodingAgentRouteEffect(input);
    if (route.kind === "acp") {
      return {
        route,
        layer: makeOntologiqlAcpStackLayer(
          route,
          input.wormDbPath
        ) as PreparedCodingAgentStack["layer"],
      };
    }
    const bundle = yield* getAdapterBundle(route.agent, route.wormDbPath);
    return {
      route,
      layer: Layer.mergeAll(
        bundle.wormLayer,
        bundle.adapterLayer,
        CodingAgentDriveLive
      ) as PreparedCodingAgentStack["layer"],
    };
  });
