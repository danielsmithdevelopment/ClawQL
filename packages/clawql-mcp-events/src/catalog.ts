import type { McpEventDefinition } from "./types.js";

/**
 * Advertised MCP Events — each entry has a live producer wired in 8.0.0.
 * @see producers.ts
 *
 * Naming: `<noun>.<past-participle>` (document.processed, schedule.completed, …).
 * Reserve `mandate.*` for fleet mandates if/when they ship.
 */
export const BUILTIN_MCP_EVENT_CATALOG: readonly McpEventDefinition[] = [
  {
    name: "stream.changed",
    description:
      "A polled API / schedule synthetic topic projection changed. Prefer action.change_detection.watch_fields so only meaningful fields are hashed. Filter by topic (schedule job id).",
    delivery: ["webhook"],
    inputSchema: {
      type: "object",
      properties: {
        topic: {
          type: "string",
          description: "Stream / topic id (ClawQL schedule job id) to monitor for changes.",
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
        cursor: { type: "string", description: "Projection hash (opaque cursor)." },
        diff: {
          type: "object",
          description: "Capped projection diff vs previous snapshot.",
          properties: {
            added: { type: "array", items: {} },
            removed: { type: "array", items: {} },
            changed: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  path: { type: "string" },
                  before: {},
                  after: {},
                },
              },
            },
            truncated: { type: "boolean" },
          },
        },
        watch_fields: {
          type: "array",
          items: { type: "string" },
          description: "Fields that were projected for this change.",
        },
        projection_tool: {
          type: "string",
          description:
            "MCP tool to re-read the full stored projection (schedule get → change_detection_state.last_projection).",
        },
        coalesced_count: {
          type: "integer",
          description: "When >1, this delivery merged multiple changes within the coalesce interval.",
        },
      },
      required: ["topic", "summary", "changed_at"],
      additionalProperties: false,
    },
  },
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
    name: "schedule.completed",
    description: "A ClawQL schedule job run completed (synthetic HTTP check).",
    delivery: ["webhook"],
    inputSchema: {
      type: "object",
      properties: {
        schedule_id: {
          type: "string",
          description: "Optional schedule job id filter.",
        },
      },
      additionalProperties: false,
    },
    payloadSchema: {
      type: "object",
      properties: {
        schedule_id: { type: "string" },
        status: { type: "string" },
        summary: { type: "string" },
      },
      required: ["schedule_id", "status"],
      additionalProperties: false,
    },
  },
  {
    name: "schedule.paused",
    description:
      "A schedule synthetic poll was paused (e.g. consecutive upstream 401/403). ChatGPT does not support terminated notices — subscribe so automations can prompt re-auth. Reconnect via schedule operation reconnect (ClawQL console Reconnect sources).",
    delivery: ["webhook"],
    inputSchema: {
      type: "object",
      properties: {
        schedule_id: {
          type: "string",
          description: "Optional schedule job id filter.",
        },
        reason: {
          type: "string",
          description: "Optional pause reason filter (e.g. upstream_auth).",
        },
      },
      additionalProperties: false,
    },
    payloadSchema: {
      type: "object",
      properties: {
        schedule_id: { type: "string" },
        reason: { type: "string" },
        summary: { type: "string" },
        name: { type: "string" },
        auth_failure_count: { type: "integer" },
        paused_at: { type: "string" },
        reconnect_operation: {
          type: "string",
          description: "MCP schedule operation to clear the pause (reconnect).",
        },
      },
      required: ["schedule_id", "reason", "summary", "paused_at"],
      additionalProperties: false,
    },
  },
  {
    name: "notification.sent",
    description: "A ClawQL notification was sent (Slack notify success).",
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

/** Empty — all 8.0.0 catalog events have live producers. Kept for future deferrals. */
export const DEFERRED_MCP_EVENT_CATALOG: readonly McpEventDefinition[] = [] as const;

export function findEventDefinition(
  name: string,
  catalog: readonly McpEventDefinition[] = BUILTIN_MCP_EVENT_CATALOG
): McpEventDefinition | undefined {
  return catalog.find((e) => e.name === name);
}
