/**
 * Density conversation runtime — every turn goes through append APIs.
 *
 * Two residence modes after the scripted Infinity-matched turns complete:
 *   - resident: history stays in the in-process Map (direct Infinity compare)
 *   - offloaded: history written to disk bags; Map keeps ids only (trade-off arm)
 */

import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { Context, Effect, Layer } from "effect";
import {
  buildInfinityMatchedTurnMessagesEffect,
  INFINITY_MATCHED_TURNS,
  serializeDensityMessagesBytesEffect,
  type DensityMessage,
} from "./infinity-matched-shape.js";

export type DensityResidence = "resident" | "offloaded";

export type DensityAgentHandle = {
  readonly agentId: string;
  readonly turnsCompleted: number;
  readonly residence: DensityResidence;
  /** Present when residence === "resident"; null when offloaded. */
  readonly messages: readonly DensityMessage[] | null;
};

export type DensityRuntimeApi = {
  readonly bagDir: string;
  readonly createAgent: (index: number) => Effect.Effect<string>;
  /** Drive one turn through append (scripted model + tool path). */
  readonly driveTurn: (agentId: string, turn: number) => Effect.Effect<void>;
  readonly driveAllTurns: (
    agentId: string,
    turns?: number
  ) => Effect.Effect<{ readonly messageCount: number; readonly serializedBytes: number }>;
  readonly parkOffloaded: (agentId: string) => Effect.Effect<{ readonly diskBytes: number }>;
  readonly retainResident: (agentId: string) => Effect.Effect<void>;
  readonly serializedBytes: (agentId: string) => Effect.Effect<number>;
  readonly messageCount: (agentId: string) => Effect.Effect<number>;
  readonly listIds: () => Effect.Effect<readonly string[]>;
  readonly clear: () => Effect.Effect<void>;
};

export class DensityConversationRuntime extends Context.Service<
  DensityConversationRuntime,
  DensityRuntimeApi
>()("clawql/DensityConversationRuntime") {}

type InternalAgent = {
  agentId: string;
  turnsCompleted: number;
  residence: DensityResidence;
  messages: DensityMessage[];
};

export function makeDensityConversationRuntime(bagDir: string): DensityRuntimeApi {
  const agents = new Map<string, InternalAgent>();

  const requireAgent = (agentId: string): Effect.Effect<InternalAgent> =>
    Effect.sync(() => {
      const a = agents.get(agentId);
      if (!a) throw new Error(`unknown density agent: ${agentId}`);
      return a;
    });

  return {
    bagDir,
    createAgent: (index: number) =>
      Effect.sync(() => {
        const agentId = `dens_${index.toString(16).padStart(8, "0")}_${randomUUID().slice(0, 8)}`;
        agents.set(agentId, {
          agentId,
          turnsCompleted: 0,
          residence: "resident",
          messages: [],
        });
        return agentId;
      }),

    driveTurn: (agentId: string, turn: number) =>
      Effect.gen(function* () {
        const agent = yield* requireAgent(agentId);
        if (agent.residence !== "resident") {
          return yield* Effect.die(new Error(`driveTurn on non-resident agent ${agentId}`));
        }
        const toolCallId = randomUUID();
        const batch = yield* buildInfinityMatchedTurnMessagesEffect(agentId, turn, toolCallId);
        // Append through the runtime store — one message at a time (queue semantics).
        for (const msg of batch) {
          agent.messages.push(msg);
        }
        agent.turnsCompleted = turn + 1;
      }),

    driveAllTurns: (agentId: string, turns = INFINITY_MATCHED_TURNS) =>
      Effect.gen(function* () {
        for (let t = 0; t < turns; t++) {
          yield* Effect.suspend(() =>
            Effect.gen(function* () {
              const agent = yield* requireAgent(agentId);
              if (agent.residence !== "resident") {
                return yield* Effect.die(new Error(`driveAllTurns on non-resident ${agentId}`));
              }
              const toolCallId = randomUUID();
              const batch = yield* buildInfinityMatchedTurnMessagesEffect(agentId, t, toolCallId);
              for (const msg of batch) {
                agent.messages.push(msg);
              }
              agent.turnsCompleted = t + 1;
            })
          );
        }
        const agent = yield* requireAgent(agentId);
        const serializedBytes = yield* serializeDensityMessagesBytesEffect(agent.messages);
        return { messageCount: agent.messages.length, serializedBytes };
      }),

    parkOffloaded: (agentId: string) =>
      Effect.gen(function* () {
        const agent = yield* requireAgent(agentId);
        mkdirSync(bagDir, { recursive: true, mode: 0o700 });
        const path = join(bagDir, `${agentId}.json`);
        const body = JSON.stringify({
          agentId,
          version: 3,
          contract: "infinity-agent-scale-matched-v1",
          status: "parked",
          turnsCompleted: agent.turnsCompleted,
          messages: agent.messages,
          parkedAt: new Date().toISOString(),
        });
        const diskBytes = Buffer.byteLength(body, "utf8");
        yield* Effect.sync(() => {
          writeFileSync(path, body, { mode: 0o600 });
          agent.messages = [];
          agent.residence = "offloaded";
        });
        return { diskBytes };
      }),

    retainResident: (agentId: string) =>
      Effect.gen(function* () {
        const agent = yield* requireAgent(agentId);
        agent.residence = "resident";
      }),

    serializedBytes: (agentId: string) =>
      Effect.gen(function* () {
        const agent = yield* requireAgent(agentId);
        if (agent.residence === "offloaded") {
          const path = join(bagDir, `${agentId}.json`);
          return yield* Effect.sync(() => Buffer.byteLength(readFileSync(path, "utf8"), "utf8"));
        }
        return yield* serializeDensityMessagesBytesEffect(agent.messages);
      }),

    messageCount: (agentId: string) =>
      Effect.gen(function* () {
        const agent = yield* requireAgent(agentId);
        if (agent.residence === "offloaded") {
          return yield* Effect.sync(() => {
            const path = join(bagDir, `${agentId}.json`);
            const raw = JSON.parse(readFileSync(path, "utf8")) as { messages: unknown[] };
            return raw.messages.length;
          });
        }
        return agent.messages.length;
      }),

    listIds: () => Effect.sync(() => [...agents.keys()]),

    clear: () =>
      Effect.sync(() => {
        agents.clear();
        if (existsSync(bagDir)) rmSync(bagDir, { recursive: true, force: true });
      }),
  };
}

export const densityConversationRuntimeLayer = (
  bagDir: string
): Layer.Layer<DensityConversationRuntime> =>
  Layer.succeed(DensityConversationRuntime, makeDensityConversationRuntime(bagDir));
