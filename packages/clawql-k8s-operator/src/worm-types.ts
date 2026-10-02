/**
 * WORM entry types for aws-celld-burst / clawql-k8s-operator.
 * Append only to host clawql-audit WORMAuditTrail — no parallel trail.
 */

export type MeshWORMEntryType =
  | "MESH_POLICY_DENIED"
  | "MESH_POLICY_DRIFT_DETECTED";

export type OperatorLifecycleWORMEntryType =
  | "FILLER_WORKLOAD_EVICTED"
  | "CELLD_CAPACITY_HEADROOM_REQUESTED"
  | "KARPENTER_NODE_REQUESTED"
  | "CELLD_FLEET_NODE_DROPPED";

/** Session-aware placement — Modal production routing fixes (spec §8.2). */
export type SessionRoutingWORMEntryType =
  | "THICC_SESSION_SPLIT"
  | "CELL_PLACEMENT_LOAD_AWARE"
  | "NEW_CAPACITY_PREFERRED_ROUTING";

export type BurstArchitectureWORMEntryType =
  | MeshWORMEntryType
  | OperatorLifecycleWORMEntryType
  | SessionRoutingWORMEntryType;

export const BURST_ARCHITECTURE_WORM_ENTRY_TYPES = [
  "MESH_POLICY_DENIED",
  "MESH_POLICY_DRIFT_DETECTED",
  "FILLER_WORKLOAD_EVICTED",
  "CELLD_CAPACITY_HEADROOM_REQUESTED",
  "KARPENTER_NODE_REQUESTED",
  "CELLD_FLEET_NODE_DROPPED",
  "THICC_SESSION_SPLIT",
  "CELL_PLACEMENT_LOAD_AWARE",
  "NEW_CAPACITY_PREFERRED_ROUTING",
] as const satisfies readonly BurstArchitectureWORMEntryType[];
