/**
 * Slack `notify` — posts via the same execute path as MCP `chat_postMessage`.
 * Transport wires `configureNotifyDeps` with the live `execute` handler.
 */

import { loadSpec, mergedAuthHeaders } from "clawql-api";

/** Slack Web API `chat.postMessage` operation id in bundled `providers/slack/openapi.json`. */
export const SLACK_NOTIFY_OPERATION_ID = "chat_postMessage";

export type NotifyExecuteFn = (params: {
  operationId: string;
  args: Record<string, unknown>;
  fields?: string[];
}) => Promise<{ content: { type: "text"; text: string }[] }>;

let executeFn: NotifyExecuteFn | null = null;

/** Called once from MCP transport (`tools.ts`) before schedule worker or notify tool use. */
export function configureNotifyDeps(deps: { execute: NotifyExecuteFn }): void {
  executeFn = deps.execute;
}

export type NotifySlackInput = {
  channel: string;
  text: string;
  thread_ts?: string;
  blocks?: string;
  attachments?: string;
  username?: string;
  icon_emoji?: string;
  icon_url?: string;
  mrkdwn?: boolean;
  unfurl_links?: boolean;
  unfurl_media?: boolean;
  reply_broadcast?: boolean;
  parse?: string;
  link_names?: boolean;
  as_user?: boolean;
  fields?: string[];
};

export async function runNotifySlack(
  params: NotifySlackInput
): Promise<{ content: { type: "text"; text: string }[] }> {
  const auth = mergedAuthHeaders("slack");
  if (!auth.Authorization) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            error:
              "Slack bot token missing. Set CLAWQL_SLACK_TOKEN (or SLACK_BOT_TOKEN, SLACK_TOKEN, CLAWQL_SLACK_BOT_TOKEN), or a `slack` entry in CLAWQL_PROVIDER_AUTH_JSON.",
          }),
        },
      ],
    };
  }

  const channel = params.channel?.trim();
  const text = params.text?.trim();
  if (!channel || !text) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ error: "`channel` and `text` are required (non-empty strings)." }),
        },
      ],
    };
  }

  const loaded = await loadSpec();
  const op = loaded.operations.find((o) => o.id === SLACK_NOTIFY_OPERATION_ID);
  if (!op) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            error: `Loaded spec has no Slack ${SLACK_NOTIFY_OPERATION_ID} (chat.postMessage). Include slack in CLAWQL_BUNDLED_PROVIDERS, set CLAWQL_PROVIDER=slack, or point CLAWQL_SPEC_PATH at the Slack Web API OpenAPI.`,
          }),
        },
      ],
    };
  }

  const args: Record<string, unknown> = { channel, text };
  const passthrough: (keyof NotifySlackInput)[] = [
    "thread_ts",
    "blocks",
    "attachments",
    "username",
    "icon_emoji",
    "icon_url",
    "parse",
  ];
  for (const k of passthrough) {
    const v = params[k];
    if (typeof v === "string" && v.trim()) args[k] = v.trim();
  }
  if (params.mrkdwn !== undefined) args.mrkdwn = params.mrkdwn;
  if (params.unfurl_links !== undefined) args.unfurl_links = params.unfurl_links;
  if (params.unfurl_media !== undefined) args.unfurl_media = params.unfurl_media;
  if (params.reply_broadcast !== undefined) args.reply_broadcast = params.reply_broadcast;
  if (params.link_names !== undefined) args.link_names = params.link_names;
  if (params.as_user !== undefined) args.as_user = params.as_user;

  if (!executeFn) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            error:
              "notify execute dependency not configured (call configureNotifyDeps from MCP transport).",
          }),
        },
      ],
    };
  }

  const exec = await executeFn({
    operationId: SLACK_NOTIFY_OPERATION_ID,
    args,
    fields: params.fields?.length ? params.fields : undefined,
  });
  const body = exec.content[0]?.text;
  if (typeof body !== "string") return exec;
  try {
    const parsed = JSON.parse(body) as { ok?: boolean; error?: string };
    if (parsed && typeof parsed === "object" && parsed.ok === false) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              error: parsed.error ?? "Slack API returned ok:false",
              slack: parsed,
            }),
          },
        ],
      };
    }
  } catch {
    // non-JSON execute error — return as-is
  }
  return exec;
}
