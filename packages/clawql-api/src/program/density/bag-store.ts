/**
 * File-backed parked-agent bag store for the fair density board.
 *
 * Offload: bag bodies live on disk; the process keeps only agent ids in memory
 * after park. Wake loads + parses one bag. Restart survival = ids rediscovered
 * from the directory after a new process starts.
 *
 * Honesty: this is the ClawQL TypeScript fair parked-agent surface for the
 * cross-system density contract — not Ready-process RSS / memory-plateau.
 */

import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { Context, Data, Effect, Layer } from "effect";
import type { FairParkedAgent } from "./types.js";

const FILE_MODE = 0o600;
const DIR_MODE = 0o700;
const AGENT_ID_PATTERN = /^bag_[a-f0-9]{8}_[a-f0-9]{8}$/;

export class ParkedBagError extends Data.TaggedError("ParkedBagError")<{
  readonly agentId: string;
  readonly reason: "invalid_id" | "not_found" | "corrupt" | "io";
  readonly message: string;
}> {}

export type ParkedBagApi = {
  readonly bagDir: string;
  readonly park: (agent: FairParkedAgent) => Effect.Effect<void, ParkedBagError>;
  readonly wake: (agentId: string) => Effect.Effect<FairParkedAgent, ParkedBagError>;
  readonly listIds: () => Effect.Effect<readonly string[], ParkedBagError>;
  readonly diskBytesTotal: () => Effect.Effect<number, ParkedBagError>;
  readonly pathFor: (agentId: string) => Effect.Effect<string, ParkedBagError>;
};

export class ParkedBagService extends Context.Service<ParkedBagService, ParkedBagApi>()(
  "clawql/ParkedBagService"
) {}

function validateId(agentId: string): Effect.Effect<string, ParkedBagError> {
  return Effect.suspend(() => {
    const id = agentId.trim();
    return AGENT_ID_PATTERN.test(id)
      ? Effect.succeed(id)
      : Effect.fail(
          new ParkedBagError({
            agentId: id.slice(0, 64),
            reason: "invalid_id",
            message: "agentId must match bag_[hex8]_[hex8]",
          })
        );
  });
}

function isFairAgent(v: unknown): v is FairParkedAgent {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const o = v as Record<string, unknown>;
  return (
    o.version === 1 &&
    o.status === "parked" &&
    typeof o.agentId === "string" &&
    Array.isArray(o.turns) &&
    o.pendingTool !== null &&
    typeof o.pendingTool === "object" &&
    typeof o.parkedAt === "string"
  );
}

function ioErr(agentId: string, cause: unknown): ParkedBagError {
  return new ParkedBagError({
    agentId,
    reason: "io",
    message: `parked bag ${agentId}: ${cause instanceof Error ? cause.message : String(cause)}`,
  });
}

export function resolveBagDirEffect(env: NodeJS.ProcessEnv = process.env): Effect.Effect<string> {
  return Effect.sync(() => {
    const explicit = env.CLAWQL_DENSITY_BAG_DIR?.trim();
    if (explicit) return resolve(explicit);
    const home = env.CLAWQL_HOME?.trim();
    if (home) return resolve(home, "density-bags");
    return resolve("/tmp/clawql-density-bags");
  });
}

export function makeParkedBagApi(bagDir: string): ParkedBagApi {
  const ensureDir = Effect.tryPromise({
    try: async () => {
      await mkdir(bagDir, { recursive: true, mode: DIR_MODE });
    },
    catch: (cause) => ioErr("", cause),
  });

  const pathFor = (agentId: string): Effect.Effect<string, ParkedBagError> =>
    validateId(agentId).pipe(Effect.map((id) => join(bagDir, `${id}.json`)));

  return {
    bagDir,
    pathFor,
    park: (agent) =>
      Effect.gen(function* () {
        yield* validateId(agent.agentId);
        yield* ensureDir;
        const path = yield* pathFor(agent.agentId);
        const tmp = `${path}.tmp`;
        const body = `${JSON.stringify(agent)}\n`;
        yield* Effect.tryPromise({
          try: async () => {
            await writeFile(tmp, body, { mode: FILE_MODE });
            await rename(tmp, path);
          },
          catch: (cause) => ioErr(agent.agentId, cause),
        });
      }),
    wake: (agentId) =>
      Effect.gen(function* () {
        const path = yield* pathFor(agentId);
        const raw = yield* Effect.tryPromise({
          try: () => readFile(path, "utf8"),
          catch: (cause) => {
            const code = (cause as NodeJS.ErrnoException | undefined)?.code;
            if (code === "ENOENT") {
              return new ParkedBagError({
                agentId,
                reason: "not_found",
                message: `parked bag not found: ${agentId}`,
              });
            }
            return ioErr(agentId, cause);
          },
        });
        let parsed: unknown;
        try {
          parsed = JSON.parse(raw);
        } catch (cause) {
          return yield* Effect.fail(
            new ParkedBagError({
              agentId,
              reason: "corrupt",
              message: `corrupt bag JSON: ${cause instanceof Error ? cause.message : String(cause)}`,
            })
          );
        }
        if (!isFairAgent(parsed) || parsed.agentId !== agentId) {
          return yield* Effect.fail(
            new ParkedBagError({
              agentId,
              reason: "corrupt",
              message: "bag failed FairParkedAgent shape or id mismatch",
            })
          );
        }
        return parsed;
      }),
    listIds: () =>
      Effect.gen(function* () {
        yield* ensureDir;
        const names = yield* Effect.tryPromise({
          try: () => readdir(bagDir),
          catch: (cause) => ioErr("", cause),
        });
        return names
          .filter((n) => n.endsWith(".json") && !n.endsWith(".tmp.json"))
          .map((n) => n.slice(0, -".json".length))
          .filter((id) => AGENT_ID_PATTERN.test(id))
          .sort();
      }),
    diskBytesTotal: () =>
      Effect.gen(function* () {
        yield* ensureDir;
        const names = yield* Effect.tryPromise({
          try: () => readdir(bagDir),
          catch: (cause) => ioErr("", cause),
        });
        let total = 0;
        for (const name of names) {
          if (!name.endsWith(".json")) continue;
          const st = yield* Effect.tryPromise({
            try: () => stat(join(bagDir, name)),
            catch: (cause) => ioErr(name, cause),
          });
          total += st.size;
        }
        return total;
      }),
  };
}

export const parkedBagLayer = (bagDir: string): Layer.Layer<ParkedBagService> =>
  Layer.succeed(ParkedBagService, makeParkedBagApi(bagDir));

export const parkedBagFromEnvLayer: Layer.Layer<ParkedBagService> = Layer.effect(
  ParkedBagService,
  Effect.map(resolveBagDirEffect(), makeParkedBagApi)
);

export function clearBagDirEffect(bagDir: string): Effect.Effect<void, ParkedBagError> {
  return Effect.tryPromise({
    try: async () => {
      await rm(bagDir, { recursive: true, force: true });
      await mkdir(bagDir, { recursive: true, mode: DIR_MODE });
    },
    catch: (cause) => ioErr("", cause),
  });
}
