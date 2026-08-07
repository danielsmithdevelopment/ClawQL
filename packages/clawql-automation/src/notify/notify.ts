/**
 * Slack `notify` — posts via the same execute path as MCP `chat_postMessage`.
 * Transport wires `configureNotifyDeps` with the live `execute` handler.
 *
 * Orchestration: native Effect.gen in {@link executeNotifySlackCoreEffect}.
 */

import { loadSpec, mergedAuthHeadersEffect } from "clawql-api";
import { Effect } from "effect";
import type { McpTextResult } from "../effect/automation-effect-utils.js";

/** Slack Web API `chat.postMessage` operation id in bundled `providers/slack/openapi.json`. */
export const SLACK_NOTIFY_OPERATION_ID = "chat_postMessage";

export type NotifyExecuteFn = (params: {
  operationId: string;
  args: Record<string, unknown>;
  fields?: string[];
}) => Promise<McpTextResult>;

let executeFn: NotifyExecuteFn | null = null;

/** Called once from MCP transport (`tools.ts`) before schedule worker or notify tool use. */
export function configureNotifyDeps(deps: { execute: NotifyExecuteFn }): void {
  executeFn = deps.execute;
}

/** Clear execute dependency (tests only). */
export function resetNotifyDepsForTests(): void {
  executeFn = null;
}

/** Test / Effect IO edge access to configured execute. */
export function getNotifyExecuteFn(): NotifyExecuteFn | null {
  return executeFn;
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

export type NotifySlackPrelude =
  | { kind: "result"; result: McpTextResult }
  | {
      kind: "ready";
      channel: string;
      text: string;
      args: Record<string, unknown>;
      fields?: string[];
    };

function mcpError(error: string): McpTextResult {
  return { content: [{ type: "text", text: JSON.stringify({ error }) }] };
}

/** Sync validation before loadSpec / execute (soft MCP JSON errors). */
export function evaluateNotifySlackPrelude(params: NotifySlackInput): NotifySlackPrelude {
  const auth = Effect.runSync(mergedAuthHeadersEffect("slack"));
  if (!auth.Authorization) {
    return {
      kind: "result",
      result: mcpError(
        "Slack bot token missing. Set CLAWQL_SLACK_TOKEN (or SLACK_BOT_TOKEN, SLACK_TOKEN, CLAWQL_SLACK_BOT_TOKEN), or a `slack` entry in CLAWQL_PROVIDER_AUTH_JSON."
      ),
    };
  }

  const channel = params.channel?.trim();
  const text = params.text?.trim();
  if (!channel || !text) {
    return {
      kind: "result",
      result: mcpError("`channel` and `text` are required (non-empty strings)."),
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

  return {
    kind: "ready",
    channel,
    text,
    args,
    fields: params.fields?.length ? params.fields : undefined,
  };
}

/** Ensure Slack chat.postMessage is present in the loaded OpenAPI set. */
export async function ensureNotifySlackOperationPresent(): Promise<McpTextResult | null> {
  const loaded = await loadSpec();
  const op = loaded.operations.find((o) => o.id === SLACK_NOTIFY_OPERATION_ID);
  if (!op) {
    return mcpError(
      `Loaded spec has no Slack ${SLACK_NOTIFY_OPERATION_ID} (chat.postMessage). Include slack in CLAWQL_BUNDLED_PROVIDERS, set CLAWQL_PROVIDER=slack, or point CLAWQL_SPEC_PATH at the Slack Web API OpenAPI.`
    );
  }
  return null;
}

/** Reshape Slack `ok:false` JSON into a notify error payload; leave other bodies as-is. */
export function reshapeSlackExecuteResult(exec: McpTextResult): McpTextResult {
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

/**
 * Promise façade over {@link executeNotifySlackCoreEffect}.
 * Prefer this from schedule/workflow side-channels (avoids nested {@link runAutomationEffect}).
 */
export async function executeNotifySlackCore(params: NotifySlackInput): Promise<McpTextResult> {
  const { executeNotifySlackCoreEffect } = await import("../effect/notify-slack-effect.js");
  return Effect.runPromise(executeNotifySlackCoreEffect(params));
}

/** Public async facade for Slack notify (MCP tools). */
export async function runNotifySlack(params: NotifySlackInput): Promise<McpTextResult> {
  const { runAutomationEffect, automationNotifyProgram } =
    await import("../effect/automation-effect-runtime.js");
  return runAutomationEffect(automationNotifyProgram(params));
}
