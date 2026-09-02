/** WORM entry types for mesh and tailcat lifecycle (clawql-audit). */
export type NetworkWORMEntryType =
  | "TAILCAT_EPHEMERAL_CONNECTION_ESTABLISHED"
  | "TAILCAT_EPHEMERAL_CONNECTION_ENDED"
  | "MESH_NODE_JOINED"
  | "MESH_NODE_REMOVED";

export type TailcatConnectionAuditPayload = {
  readonly type: "TAILCAT_EPHEMERAL_CONNECTION_ESTABLISHED" | "TAILCAT_EPHEMERAL_CONNECTION_ENDED";
  readonly sessionId: string;
  readonly localPublicKey: string;
  readonly remotePublicKey: string;
  /** null when NAT traversal succeeded without DERP relay */
  readonly derpServer: string | null;
  readonly timestamp: string;
};

export type MeshNodeAuditPayload = {
  readonly type: "MESH_NODE_JOINED" | "MESH_NODE_REMOVED";
  readonly nodeId: string;
  readonly meshIdentity?: string;
  readonly timestamp: string;
};
