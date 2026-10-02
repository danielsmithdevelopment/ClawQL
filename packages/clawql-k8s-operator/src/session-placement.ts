/**
 * Session-aware cell placement (aws-celld-burst §8.2 Modal-sourced behaviors).
 * Pure Effect helpers — not a live Kubernetes controller.
 */

import { Context, Effect, Layer } from "effect";
import type { SessionRoutingWORMEntryType } from "./worm-types.js";

export type CelldNodeLoad = {
  readonly nodeId: string;
  readonly runningCellCount: number;
  readonly memoryUtil: number; // 0–1
  readonly newlyProvisioned?: boolean;
};

export type PlacementRequest = {
  readonly sessionId: string;
  readonly subscriptionId: string;
  /** Concurrent cell spawns already attributed to this session on preferredNode. */
  readonly sessionSpawnCountOnPreferred: number;
  readonly preferredNodeId?: string;
  readonly nodes: readonly CelldNodeLoad[];
  /** Per-session concurrency threshold before thicc-session split. */
  readonly thiccSessionThreshold: number;
};

export type PlacementDecision = {
  readonly nodeId: string;
  readonly wormType: SessionRoutingWORMEntryType;
  readonly reason: string;
  readonly signals: {
    readonly runningCellCount: number;
    readonly memoryUtil: number;
    readonly sessionSpawnCountOnPreferred: number;
  };
};

function loadScore(n: CelldNodeLoad): number {
  // Lower is better — prefer fewer cells and lower memory.
  return n.runningCellCount + n.memoryUtil * 10;
}

/**
 * Prefer newly-provisioned capacity for new work during scale-up;
 * otherwise pick lowest load; split thicc sessions off preferred node.
 */
export function decideSessionCellPlacement(req: PlacementRequest): PlacementDecision {
  if (req.nodes.length === 0) {
    throw new Error("decideSessionCellPlacement: empty node set");
  }

  const newCap = req.nodes.filter((n) => n.newlyProvisioned);
  if (newCap.length > 0) {
    const pick = [...newCap].sort((a, b) => loadScore(a) - loadScore(b))[0]!;
    return {
      nodeId: pick.nodeId,
      wormType: "NEW_CAPACITY_PREFERRED_ROUTING",
      reason: "prefer newly-provisioned capacity during scale-up",
      signals: {
        runningCellCount: pick.runningCellCount,
        memoryUtil: pick.memoryUtil,
        sessionSpawnCountOnPreferred: req.sessionSpawnCountOnPreferred,
      },
    };
  }

  if (
    req.preferredNodeId &&
    req.sessionSpawnCountOnPreferred >= req.thiccSessionThreshold
  ) {
    const others = req.nodes.filter((n) => n.nodeId !== req.preferredNodeId);
    const pool = others.length > 0 ? others : req.nodes;
    const pick = [...pool].sort((a, b) => loadScore(a) - loadScore(b))[0]!;
    return {
      nodeId: pick.nodeId,
      wormType: "THICC_SESSION_SPLIT",
      reason: `session spawn count ${req.sessionSpawnCountOnPreferred} ≥ threshold ${req.thiccSessionThreshold}`,
      signals: {
        runningCellCount: pick.runningCellCount,
        memoryUtil: pick.memoryUtil,
        sessionSpawnCountOnPreferred: req.sessionSpawnCountOnPreferred,
      },
    };
  }

  const pick = [...req.nodes].sort((a, b) => loadScore(a) - loadScore(b))[0]!;
  return {
    nodeId: pick.nodeId,
    wormType: "CELL_PLACEMENT_LOAD_AWARE",
    reason: "load-aware placement (running cells + memory util)",
    signals: {
      runningCellCount: pick.runningCellCount,
      memoryUtil: pick.memoryUtil,
      sessionSpawnCountOnPreferred: req.sessionSpawnCountOnPreferred,
    },
  };
}

export type MeshDenialEvent = {
  readonly requestId: string;
  readonly sourceIdentity: string;
  readonly destination: string;
  readonly layer: "ztunnel" | "waypoint";
  readonly reason: string;
  readonly sessionId?: string;
};

export type BridgedMeshDenial = {
  readonly wormType: "MESH_POLICY_DENIED";
  readonly sessionId: string;
  readonly metadata: MeshDenialEvent;
};

/** Bridge Istio denial telemetry into a clawql-audit-shaped payload (host appends). */
export function bridgeMeshDenial(event: MeshDenialEvent): BridgedMeshDenial {
  return {
    wormType: "MESH_POLICY_DENIED",
    sessionId: event.sessionId ?? `mesh:${event.sourceIdentity}`,
    metadata: event,
  };
}

export class SessionPlacementService extends Context.Tag("clawql/SessionPlacementService")<
  SessionPlacementService,
  {
    readonly place: (req: PlacementRequest) => Effect.Effect<PlacementDecision>;
    readonly bridgeDenial: (event: MeshDenialEvent) => Effect.Effect<BridgedMeshDenial>;
  }
>() {}

export const SessionPlacementServiceLive: Layer.Layer<SessionPlacementService> = Layer.succeed(
  SessionPlacementService,
  {
    place: (req) => Effect.sync(() => decideSessionCellPlacement(req)),
    bridgeDenial: (event) => Effect.sync(() => bridgeMeshDenial(event)),
  }
);
