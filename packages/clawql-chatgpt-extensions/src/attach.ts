import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { OpenAIExtensions } from "@openai/mcp-extensions/server";
import { z } from "zod";
import {
  buildOpenAiDiscoverExtensions,
  detectChatgptFeatureSupport,
  shouldExposeUiTools,
  type ClientCapabilitySnapshot,
} from "./capabilities.js";
import { isChatgptExtensionsEnabled } from "./config.js";
import { consoleUrlForAuditEntry, resolveConsoleDeepLink, sectionsForUser } from "./console.js";
import { listEvidenceForThread, verifyEvidenceChain } from "./evidence.js";
import { openClawqlFile, scrubAbsolutePaths } from "./files.js";
import {
  consoleToolMeta,
  evidenceToolMeta,
  mentionsSearchMeta,
  openFileToolMeta,
  settingsToolMeta,
} from "./meta.js";
import { demoMentionSources, loadVaultMentionSources, searchMentions } from "./mentions.js";
import { readUserSettings, settingsReadPayload, updateUserSettings } from "./settings-store.js";
import { MCP_APP_MIME, readUiResource, UI_RESOURCE_URIS } from "./ui-resources.js";

export type AttachChatgptExtensionsOptions = {
  readonly env?: NodeJS.ProcessEnv;
  /**
   * When set, UI-only tools register only if the client advertises support.
   * When omitted, register UI tools (typical ChatGPT attach). Pass `{}` /
   * null to omit UI tools for non-ChatGPT clients.
   */
  readonly clientCapabilities?: ClientCapabilitySnapshot | null;
  /** Force-register UI tools (tests). */
  readonly forceUiTools?: boolean;
};

function textResult(payload: unknown) {
  return {
    content: [
      { type: "text" as const, text: JSON.stringify(scrubAbsolutePaths(payload), null, 2) },
    ],
  };
}

/**
 * Attach OpenAI MCP extensions + ClawQL UI tools/resources to an MCP server.
 * No-op when `CLAWQL_ENABLE_CHATGPT_EXTENSIONS=0`.
 *
 * Settings tools are registered with ClawQL names (discover advertises them).
 * {@link OpenAIExtensions} provides `elicitInput` for mandate forms (MRTR).
 */
export function attachChatgptExtensions(
  server: McpServer,
  options: AttachChatgptExtensionsOptions = {}
): { readonly attached: boolean; readonly openai: OpenAIExtensions | null } {
  const env = options.env ?? process.env;
  if (!isChatgptExtensionsEnabled(env)) {
    return { attached: false, openai: null };
  }

  const support = detectChatgptFeatureSupport(options.clientCapabilities);
  const exposeUi =
    options.forceUiTools === true ||
    options.clientCapabilities === undefined ||
    shouldExposeUiTools(support);

  const openai = new OpenAIExtensions(server);
  registerSettingsTools(server);
  advertiseSettingsCapability(server);

  if (exposeUi) {
    registerUiTools(server, env);
    registerUiResources(server);
  }

  return { attached: true, openai };
}

function advertiseSettingsCapability(server: McpServer): void {
  const capability = buildOpenAiDiscoverExtensions()["openai/settings"] as {
    readTool: string;
    updateTool: string;
  };
  try {
    server.server.registerCapabilities({
      extensions: { "openai/settings": capability },
      experimental: { "openai/settings": capability },
    });
  } catch {
    // Older SDK builds may not expose registerCapabilities — discover still advertises.
  }
}

function registerSettingsTools(server: McpServer): void {
  server.registerTool(
    "clawql_settings_read",
    {
      title: "ClawQL settings",
      description: "Read per-user ClawQL ChatGPT settings (schema, values, layout).",
      inputSchema: {},
      annotations: { readOnlyHint: true },
      _meta: settingsToolMeta(),
    },
    async () => textResult(settingsReadPayload("default"))
  );

  server.registerTool(
    "clawql_settings_update",
    {
      title: "Update ClawQL settings",
      description: "Update per-user ClawQL ChatGPT settings; send only changed values in set.",
      inputSchema: {
        set: z
          .object({
            evidenceDetail: z.enum(["summary", "full"]).optional(),
            approvalTimeoutMinutes: z.number().int().min(1).max(60).optional(),
            showRedactedPlaceholders: z.boolean().optional(),
          })
          .describe("Changed settings only"),
      },
      _meta: settingsToolMeta(),
    },
    async (args) => {
      const set = (args as { set?: Record<string, unknown> }).set ?? {};
      if (Object.keys(set).length === 0) {
        return textResult({ error: "Set at least one setting." });
      }
      const next = updateUserSettings("default", set as Parameters<typeof updateUserSettings>[1]);
      return textResult({ values: next });
    }
  );
}

function registerUiTools(server: McpServer, env: NodeJS.ProcessEnv): void {
  server.registerTool(
    "clawql_mentions_search",
    {
      title: "Search ClawQL mentions",
      description: "Search vault notes, ontology entities, and processed documents for @-mentions.",
      inputSchema: {
        query: z.string().describe("Search query; empty returns recent items"),
      },
      annotations: { readOnlyHint: true },
      _meta: mentionsSearchMeta(),
    },
    async (args) => {
      const query = String((args as { query?: string }).query ?? "");
      const sources = [...loadVaultMentionSources(env), ...demoMentionSources()];
      return textResult(searchMentions(query, sources));
    }
  );

  server.registerTool(
    "clawql_evidence",
    {
      title: "Evidence",
      description: "This thread's ClawQL tool calls, gate decisions, redactions, and WORM entries.",
      inputSchema: {
        action: z.enum(["list", "verify"]).optional().describe("list (default) or verify chain"),
        threadId: z.string().optional().describe("Thread id; defaults to MCP session"),
      },
      annotations: { readOnlyHint: true },
      _meta: evidenceToolMeta(),
    },
    async (args) => {
      const a = args as { action?: string; threadId?: string };
      const userId = "default";
      const threadId = a.threadId?.trim() || "session";
      const detail = readUserSettings(userId).evidenceDetail;
      const entries = listEvidenceForThread({ threadId, userId, detail });
      if (a.action === "verify") {
        return textResult({
          resourceUri: UI_RESOURCE_URIS.evidence,
          verify: verifyEvidenceChain(entries),
          entries,
        });
      }
      return textResult({
        resourceUri: UI_RESOURCE_URIS.evidence,
        entries,
        consoleHint: consoleUrlForAuditEntry(entries[0]?.id ?? "none"),
      });
    }
  );

  server.registerTool(
    "clawql_console",
    {
      title: "ClawQL console",
      description: "Open the ClawQL six-section dashboard (fullscreen sidebar).",
      inputSchema: {
        path: z.string().optional().describe("Deep-link path, e.g. activity/<id>"),
      },
      annotations: { readOnlyHint: true },
      _meta: consoleToolMeta(),
    },
    async (args) => {
      const path = (args as { path?: string }).path;
      const deep = resolveConsoleDeepLink(path);
      return textResult({
        resourceUri: UI_RESOURCE_URIS.console,
        displayMode: "fullscreen",
        sections: sectionsForUser({ isAdmin: false }),
        deepLink: deep,
      });
    }
  );

  server.registerTool(
    "clawql_open_file",
    {
      title: "Open ClawQL file",
      description: "Open and edit .cqe ontology schemas or .cqk memory notes.",
      inputSchema: {
        file: z.object({
          name: z.string(),
          resourceUri: z.string(),
        }),
        content: z.string().optional().describe("Text representation of the file"),
      },
      _meta: openFileToolMeta(),
    },
    async (args, extra) => {
      const a = args as {
        file: { name: string; resourceUri: string };
        content?: string;
      };
      const meta = (extra as { _meta?: Record<string, unknown> } | undefined)?._meta;
      const resourceMeta = meta?.["openai/resource"] as { path?: string } | undefined;
      const absolutePath = resourceMeta?.path;
      const result = openClawqlFile({ file: a.file, absolutePath }, a.content ?? "{}");
      return textResult(result);
    }
  );
}

function registerUiResources(server: McpServer): void {
  for (const uri of Object.values(UI_RESOURCE_URIS)) {
    server.resource(uri, uri, { mimeType: MCP_APP_MIME }, async () => {
      const body = readUiResource(uri);
      if (!body) {
        return { contents: [] };
      }
      return {
        contents: [
          {
            uri,
            mimeType: body.mimeType,
            text: body.text,
          },
        ],
      };
    });
  }
}

/** Discover capabilities.extensions fragment when the package is enabled. */
export function chatgptExtensionsDiscoverFragment(
  env: NodeJS.ProcessEnv = process.env
): Record<string, unknown> | undefined {
  if (!isChatgptExtensionsEnabled(env)) return undefined;
  return buildOpenAiDiscoverExtensions();
}

export { recordEvidenceEntry } from "./evidence.js";
