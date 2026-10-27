/**
 * ADR 0017 routing: prefer Agent Client Protocol when the coding agent speaks it;
 * fall back to native clawql-agents adapters otherwise.
 *
 * Ontologiql / ClawQL runners should call {@link resolveCodingAgentRouteEffect}
 * before opening a new native-adapter design.
 */
import { Effect } from "effect";
import type { AcpSpawnConfig } from "../acp/types.js";
import { IMPLEMENTED_AGENTS } from "../get-adapter.js";
import type { AgentName } from "../shared/types.js";

/** Well-known ACP-capable agent binaries (not the seven native catalog names). */
export type AcpCapableAgentId = "cursor-cli" | "custom";

export type CodingAgentTarget =
  | { readonly kind: "acp"; readonly id: AcpCapableAgentId }
  | { readonly kind: "native"; readonly agent: AgentName }
  | {
      /** Ambiguous string — resolved via preferAcp + known ACP ids. */
      readonly kind: "auto";
      readonly name: string;
    };

export type CodingAgentRoute =
  | {
      readonly kind: "acp";
      readonly id: AcpCapableAgentId;
      readonly spawn: AcpSpawnConfig;
      readonly reason: string;
    }
  | {
      readonly kind: "native";
      readonly agent: AgentName;
      readonly wormDbPath: string;
      readonly reason: string;
    };

export type ResolveCodingAgentRouteInput = {
  readonly target: CodingAgentTarget;
  /** Local WORM db path when falling back to a native adapter. */
  readonly wormDbPath: string;
  /**
   * When true (default), auto targets that match ACP-capable ids use ACP.
   * Set false to force native for catalog agents even if a bridge exists later.
   */
  readonly preferAcp?: boolean;
  /** Override spawn for ACP routes (cwd, env, handlers, custom command). */
  readonly acpSpawn?: Partial<AcpSpawnConfig> & {
    readonly command?: string;
    readonly args?: readonly string[];
  };
  /** Force native even when target is ACP-capable (document gap in adapter README). */
  readonly forceNative?: boolean;
};

const DEFAULT_ACP_SPAWN: Record<Exclude<AcpCapableAgentId, "custom">, AcpSpawnConfig> = {
  "cursor-cli": {
    command: "agent",
    args: ["acp"],
    clientInfo: { name: "clawql-ontologiql-runner", version: "0.1.0" },
  },
};

const isAgentName = (name: string): name is AgentName =>
  (IMPLEMENTED_AGENTS as readonly string[]).includes(name);

const isAcpCapableId = (name: string): name is Exclude<AcpCapableAgentId, "custom"> =>
  name === "cursor-cli" || name === "cursor" || name === "agent";

const normalizeAcpId = (name: string): AcpCapableAgentId => {
  if (name === "cursor" || name === "agent" || name === "cursor-cli") return "cursor-cli";
  return "custom";
};

export const resolveCodingAgentRouteEffect = (
  input: ResolveCodingAgentRouteInput
): Effect.Effect<CodingAgentRoute> =>
  Effect.sync(() => {
    const preferAcp = input.preferAcp !== false;
    const mergeSpawn = (base: AcpSpawnConfig, id: AcpCapableAgentId): AcpSpawnConfig => ({
      ...base,
      ...input.acpSpawn,
      command: input.acpSpawn?.command ?? base.command,
      args: input.acpSpawn?.args ?? base.args,
      clientInfo: input.acpSpawn?.clientInfo ?? base.clientInfo,
      handlers: input.acpSpawn?.handlers ?? base.handlers,
      cwd: input.acpSpawn?.cwd ?? base.cwd,
      env: input.acpSpawn?.env ?? base.env,
      clientCapabilities: input.acpSpawn?.clientCapabilities ?? base.clientCapabilities,
      ...(id === "custom" && input.acpSpawn?.command
        ? {}
        : id === "custom"
          ? { command: input.acpSpawn?.command ?? "agent", args: input.acpSpawn?.args ?? ["acp"] }
          : {}),
    });

    if (input.forceNative && input.target.kind !== "acp") {
      const agent =
        input.target.kind === "native"
          ? input.target.agent
          : isAgentName(input.target.name)
            ? input.target.name
            : null;
      if (!agent) {
        throw new Error(
          `forceNative set but target is not a native catalog agent: ${JSON.stringify(input.target)}`
        );
      }
      return {
        kind: "native",
        agent,
        wormDbPath: input.wormDbPath,
        reason: "forceNative=true — skip ACP even if a bridge exists",
      };
    }

    if (input.target.kind === "acp") {
      const id = input.target.id;
      const base =
        id === "cursor-cli"
          ? DEFAULT_ACP_SPAWN["cursor-cli"]
          : {
              command: input.acpSpawn?.command ?? "agent",
              args: input.acpSpawn?.args ?? ["acp"],
              clientInfo: { name: "clawql-ontologiql-runner", version: "0.1.0" },
            };
      return {
        kind: "acp",
        id,
        spawn: mergeSpawn(base, id),
        reason: "explicit ACP target (ADR 0017 prefer Agent Client Protocol)",
      };
    }

    if (input.target.kind === "native") {
      return {
        kind: "native",
        agent: input.target.agent,
        wormDbPath: input.wormDbPath,
        reason: "explicit native catalog adapter",
      };
    }

    // auto
    const name = input.target.name.trim().toLowerCase();
    if (preferAcp && isAcpCapableId(name)) {
      const id = normalizeAcpId(name);
      const base = DEFAULT_ACP_SPAWN["cursor-cli"];
      return {
        kind: "acp",
        id,
        spawn: mergeSpawn(base, id),
        reason: `auto: "${input.target.name}" maps to ACP-capable ${id}`,
      };
    }
    if (isAgentName(name)) {
      return {
        kind: "native",
        agent: name,
        wormDbPath: input.wormDbPath,
        reason: `auto: "${input.target.name}" is a native catalog agent (no ACP surface assumed)`,
      };
    }
    if (preferAcp) {
      // Unknown name + preferAcp → treat as custom ACP spawn (caller must supply command).
      return {
        kind: "acp",
        id: "custom",
        spawn: mergeSpawn(
          {
            command: input.acpSpawn?.command ?? name,
            args: input.acpSpawn?.args ?? ["acp"],
            clientInfo: { name: "clawql-ontologiql-runner", version: "0.1.0" },
          },
          "custom"
        ),
        reason: `auto: unknown "${input.target.name}" — ACP-first with custom spawn (set acpSpawn.command)`,
      };
    }
    throw new Error(
      `Cannot resolve coding agent "${input.target.name}" — not a catalog agent and preferAcp=false`
    );
  });

/** Sync façade for config loaders at host boundaries. */
export const resolveCodingAgentRoute = (input: ResolveCodingAgentRouteInput): CodingAgentRoute =>
  Effect.runSync(resolveCodingAgentRouteEffect(input));
