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

export type BurstArchitectureWORMEntryType =
  | MeshWORMEntryType
  | OperatorLifecycleWORMEntryType;

export const BURST_ARCHITECTURE_WORM_ENTRY_TYPES = [
  "MESH_POLICY_DENIED",
  "MESH_POLICY_DRIFT_DETECTED",
  "FILLER_WORKLOAD_EVICTED",
  "CELLD_CAPACITY_HEADROOM_REQUESTED",
  "KARPENTER_NODE_REQUESTED",
  "CELLD_FLEET_NODE_DROPPED",
] as const satisfies readonly BurstArchitectureWORMEntryType[];
