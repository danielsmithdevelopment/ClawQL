/**
 * Fair parked-agent payload builders (same agent every system).
 *
 * Conversation: 20 turns of realistic size (~1–2 KiB text each turn pair).
 * Pending tool: one pending approval / tool call (~0.5 KiB JSON).
 * Park: waiting on that tool (idle durable).
 */

import { createHash, randomBytes } from "node:crypto";
import { Effect } from "effect";
import type { FairParkedAgent, FairPendingTool, FairTurn } from "./types.js";

const TURN_PAIRS = 20;
/** Target bytes per user+assistant pair (middle of 1–2 KiB). */
const PAIR_BYTES_TARGET = 1536;
const PENDING_BYTES_TARGET = 512;

const FILL =
  "The agent reviewed the open mandate, checked the audit trail, and drafted the next governed tool call. ";

function padTo(target: number, seed: string): string {
  if (seed.length >= target) return seed.slice(0, target);
  const reps = Math.ceil((target - seed.length) / FILL.length) + 1;
  return (seed + FILL.repeat(reps)).slice(0, target);
}

export function fairTurnCountEffect(): Effect.Effect<number> {
  return Effect.succeed(TURN_PAIRS);
}

export function buildFairTurnsEffect(agentIndex: number): Effect.Effect<readonly FairTurn[]> {
  return Effect.sync(() => {
    const turns: FairTurn[] = [];
    const half = Math.floor(PAIR_BYTES_TARGET / 2);
    for (let i = 0; i < TURN_PAIRS; i++) {
      const userSeed = `user[${agentIndex}.${i}] Please resume parked work on ticket T-${agentIndex}-${i}: `;
      const asstSeed = `assistant[${agentIndex}.${i}] Acknowledged. Holding for tool approval before mutating state. `;
      turns.push({ i: i * 2, role: "user", text: padTo(half, userSeed) });
      turns.push({ i: i * 2 + 1, role: "assistant", text: padTo(half, asstSeed) });
    }
    return turns;
  });
}

export function buildFairPendingToolEffect(agentIndex: number): Effect.Effect<FairPendingTool> {
  return Effect.sync(() => {
    const approvalId = `appr_${createHash("sha256")
      .update(`fair-${agentIndex}`)
      .digest("hex")
      .slice(0, 24)}`;
    const base: FairPendingTool = {
      name: "execute",
      arguments: {
        operationId: "pets.update",
        args: {
          petId: `pet_${agentIndex}`,
          patch: {
            status: "pending_approval",
            note: padTo(
              Math.max(64, PENDING_BYTES_TARGET - 180),
              `Fair density pending tool payload for agent ${agentIndex}. `
            ),
          },
        },
        risk: { policy: "mandate", level: "HIGH" },
      },
      approvalId,
    };
    const encoded = Buffer.byteLength(JSON.stringify(base), "utf8");
    if (encoded >= PENDING_BYTES_TARGET - 64) return base;
    return {
      ...base,
      arguments: {
        ...base.arguments,
        padding: padTo(PENDING_BYTES_TARGET - encoded + 32, `pad-${agentIndex}-`),
      },
    };
  });
}

export function newFairAgentIdEffect(agentIndex: number): Effect.Effect<string> {
  return Effect.sync(
    () => `bag_${agentIndex.toString(16).padStart(8, "0")}_${randomBytes(4).toString("hex")}`
  );
}

/** Default horizon for random wake deadlines (approval expiry / reminder). */
export const FAIR_DEADLINE_HORIZON_MS = 3_000;

export function buildFairParkedAgentEffect(
  agentIndex: number,
  parkedAtIso?: string,
  opts?: {
    readonly nowMs?: number;
    readonly deadlineHorizonMs?: number;
    readonly wakeDeadlineAt?: string;
  }
): Effect.Effect<FairParkedAgent> {
  return Effect.gen(function* () {
    const agentId = yield* newFairAgentIdEffect(agentIndex);
    const turns = yield* buildFairTurnsEffect(agentIndex);
    const pendingTool = yield* buildFairPendingToolEffect(agentIndex);
    const parkedAt = parkedAtIso ?? new Date().toISOString();
    const nowMs = opts?.nowMs ?? Date.now();
    const horizon = opts?.deadlineHorizonMs ?? FAIR_DEADLINE_HORIZON_MS;
    const wakeDeadlineAt =
      opts?.wakeDeadlineAt ??
      new Date(nowMs + Math.floor(Math.random() * Math.max(1, horizon))).toISOString();
    return {
      agentId,
      version: 2 as const,
      status: "parked" as const,
      turns,
      pendingTool,
      parkedAt,
      wakeDeadlineAt,
    };
  });
}

/** Serialized bag size used for disk accounting honesty checks. */
export function fairAgentEncodedBytesEffect(agent: FairParkedAgent): Effect.Effect<number> {
  return Effect.sync(() => Buffer.byteLength(JSON.stringify(agent), "utf8"));
}
