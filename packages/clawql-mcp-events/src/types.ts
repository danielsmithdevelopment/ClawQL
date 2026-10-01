/** Types for MCP Events (ChatGPT / draft MCP Events webhook delivery). */

export type McpEventDeliveryMode = "webhook";

export type JsonSchemaObject = {
  type: "object";
  properties?: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
};

export type McpEventDefinition = {
  name: string;
  description: string;
  delivery: McpEventDeliveryMode[];
  inputSchema: JsonSchemaObject;
  payloadSchema: JsonSchemaObject;
};

export type WebhookDelivery = {
  mode: "webhook";
  url: string;
  /** Present on subscribe; omitted on unsubscribe. */
  secret?: string;
};

export type SubscribeParams = {
  name: string;
  arguments?: Record<string, unknown>;
  delivery: WebhookDelivery;
  cursor?: string | null;
  ttlMs?: number | null;
  /** Authenticated principal (ATR sub / API key id). */
  principal: string;
};

export type UnsubscribeParams = {
  name: string;
  arguments?: Record<string, unknown>;
  delivery: Pick<WebhookDelivery, "mode" | "url">;
  principal: string;
};

export type SubscribeResult = {
  id: string;
  refreshBefore: string | null;
  cursor: string | null;
  truncated: boolean;
};

export type ListEventsParams = {
  cursor?: string;
  /** When set, filter catalog to events the principal may discover. */
  principal?: string;
};

export type ListEventsResult = {
  events: McpEventDefinition[];
  nextCursor?: string;
};

export type DeliverableEvent = {
  eventId: string;
  name: string;
  timestamp: string;
  data: Record<string, unknown>;
  cursor?: string | null;
};

export type StoredSubscription = {
  id: string;
  principal: string;
  name: string;
  arguments: Record<string, unknown>;
  url: string;
  secret: string;
  /** Previous secret during rotation window. */
  previousSecret?: string;
  previousSecretExpiresAt?: string;
  refreshBefore: string | null;
  cursor: string | null;
  verified: boolean;
  createdAt: string;
  updatedAt: string;
  /** Optional access fingerprint for rechecks. */
  accessToken?: string;
};

export type DeliveryOutcome = {
  accepted: boolean;
  status: number;
  attempts: number;
  stopped: boolean;
  reason?: string;
};

export type AccessCheck = (input: {
  principal: string;
  eventName: string;
  arguments: Record<string, unknown>;
}) => boolean | Promise<boolean>;

export type WormAppend = (event: {
  type: string;
  payload: Record<string, unknown>;
}) => void | Promise<void>;
