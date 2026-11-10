/** WORM entry types for mesh, Tailcat, and customer-tailnet lifecycle (clawql-audit). Spec §8.2. */
export type NetworkWORMEntryType =
  | "TAILCAT_CONNECTION_REQUESTED"
  | "TAILCAT_CONNECTION_ESTABLISHED"
  | "TAILCAT_CONNECTION_ENDED"
  | "TAILCAT_CONNECTION_FAILED"
  | "CUSTOMER_TAILNET_AUTHORIZED"
  | "CUSTOMER_TAILNET_DEVICE_REMOVED"
  | "MESH_NODE_JOINED"
  | "MESH_NODE_REMOVED"
  /** @deprecated v0.1 names — kept for existing audit readers */
  | "TAILCAT_EPHEMERAL_CONNECTION_ESTABLISHED"
  | "TAILCAT_EPHEMERAL_CONNECTION_ENDED";

export type TailcatConnectionAuditPayload = {
  readonly type:
    | "TAILCAT_CONNECTION_REQUESTED"
    | "TAILCAT_CONNECTION_ESTABLISHED"
    | "TAILCAT_CONNECTION_ENDED"
    | "TAILCAT_CONNECTION_FAILED"
    | "TAILCAT_EPHEMERAL_CONNECTION_ESTABLISHED"
    | "TAILCAT_EPHEMERAL_CONNECTION_ENDED";
  readonly sessionId: string;
  readonly localPublicKey: string;
  readonly remotePublicKey: string;
  /** null when NAT traversal succeeded without DERP relay */
  readonly derpServer: string | null;
  readonly timestamp: string;
};

export type CustomerTailnetAuditPayload = {
  readonly type: "CUSTOMER_TAILNET_AUTHORIZED" | "CUSTOMER_TAILNET_DEVICE_REMOVED";
  readonly sessionId: string;
  readonly tenantId: string;
  readonly timestamp: string;
};

export type MeshNodeAuditPayload = {
  readonly type: "MESH_NODE_JOINED" | "MESH_NODE_REMOVED";
  readonly nodeId: string;
  readonly meshIdentity?: string;
  readonly timestamp: string;
};
