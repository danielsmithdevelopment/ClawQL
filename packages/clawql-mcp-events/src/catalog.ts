import type { McpEventDefinition } from "./types.js";

/**
 * Deferred until clawql-streams / change-detection producers ship.
 * Do not advertise — vapor without a live emit path.
 */
export const DEFERRED_MCP_EVENT_CATALOG: readonly McpEventDefinition[] = [
  {
    name: "stream.changed",
    description:
      "A polled API or stream topic changed (ClawQL change detection). Filter by topic id.",
    delivery: ["webhook"],
    inputSchema: {
      type: "object",
      properties: {
        topic: {
          type: "string",
          description: "Stream / topic id to monitor for changes.",
        },
      },
      required: ["topic"],
      additionalProperties: false,
    },
    payloadSchema: {
      type: "object",
      properties: {
        topic: { type: "string" },
        summary: { type: "string" },
        changed_at: { type: "string" },
        cursor: { type: "string" },
      },
      required: ["topic", "summary", "changed_at"],
      additionalProperties: false,
    },
  },
] as const;

/**
 * Advertised MCP Events — each entry has a live producer wired in 8.0.0.
 * @see producers.ts
 */
export const BUILTIN_MCP_EVENT_CATALOG: readonly McpEventDefinition[] = [
  {
    name: "document.processed",
    description: "A document finished IDP / document pipeline processing.",
    delivery: ["webhook"],
    inputSchema: {
      type: "object",
      properties: {
        document_id: {
          type: "string",
          description: "Optional document id filter.",
        },
      },
      additionalProperties: false,
    },
    payloadSchema: {
      type: "object",
      properties: {
        document_id: { type: "string" },
        status: { type: "string" },
        summary: { type: "string" },
        url: { type: "string" },
      },
      required: ["document_id", "status"],
      additionalProperties: false,
    },
  },
  {
    name: "hook.blocked",
    description: "A policy, ATR, or hook blocked a tool call.",
    delivery: ["webhook"],
    inputSchema: {
      type: "object",
      properties: {
        tool: { type: "string", description: "Optional tool name filter." },
      },
      additionalProperties: false,
    },
    payloadSchema: {
      type: "object",
      properties: {
        tool: { type: "string" },
        reason: { type: "string" },
        session_id: { type: "string" },
      },
      required: ["tool", "reason"],
      additionalProperties: false,
    },
  },
  {
    name: "budget.exhausted",
    description: "An inference or spend budget was exhausted.",
    delivery: ["webhook"],
    inputSchema: {
      type: "object",
      properties: {
        budget_id: { type: "string", description: "Optional budget id filter." },
      },
      additionalProperties: false,
    },
    payloadSchema: {
      type: "object",
      properties: {
        budget_id: { type: "string" },
        scope: { type: "string" },
        exhausted_at: { type: "string" },
      },
      required: ["budget_id", "exhausted_at"],
      additionalProperties: false,
    },
  },
  {
    name: "mandate.completed",
    description:
      "A schedule / mandate automation run completed (ClawQL schedule job id as mandate_id).",
    delivery: ["webhook"],
    inputSchema: {
      type: "object",
      properties: {
        mandate_id: { type: "string", description: "Optional mandate / schedule job id filter." },
      },
      additionalProperties: false,
    },
    payloadSchema: {
      type: "object",
      properties: {
        mandate_id: { type: "string" },
        status: { type: "string" },
        summary: { type: "string" },
      },
      required: ["mandate_id", "status"],
      additionalProperties: false,
    },
  },
  {
    name: "clawql.notification",
    description: "ClawQL notification (Slack notify success and synthetic demos).",
    delivery: ["webhook"],
    inputSchema: {
      type: "object",
      properties: {
        channel: { type: "string", description: "Optional channel filter." },
      },
      additionalProperties: false,
    },
    payloadSchema: {
      type: "object",
      properties: {
        channel: { type: "string" },
        text: { type: "string" },
        url: { type: "string" },
      },
      required: ["text"],
      additionalProperties: false,
    },
  },
] as const;

export function findEventDefinition(
  name: string,
  catalog: readonly McpEventDefinition[] = BUILTIN_MCP_EVENT_CATALOG
): McpEventDefinition | undefined {
  return catalog.find((e) => e.name === name);
}
