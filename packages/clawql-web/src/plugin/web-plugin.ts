import { logMcpToolShape } from "clawql-api/mcp/tool-shape-log";
import type { Plugin } from "clawql-core";
import { Effect } from "effect";
import { z } from "zod";
import { installWebAuditWormSink } from "../audit.js";
import { isWebEnabled } from "../config.js";
import { isWebCapabilityError } from "../errors.js";
import { createWebService } from "../service.js";

export const WEB_PLUGIN_ID = "clawql-web";

export const webSearchSchema = {
  query: z.string().describe("Search query"),
  limit: z.number().int().min(1).max(20).optional().describe("Max results"),
  correlationId: z.string().optional(),
};

export const webFetchSchema = {
  url: z.string().url().describe("Absolute URL to fetch"),
  format: z.enum(["markdown", "html", "text"]).optional(),
  /**
   * When true, return raw bytes + content-type (IDP / pdf-inspector) instead of
   * markdown via the browser provider. Does not require a browser provider.
   */
  raw: z.boolean().optional().describe("Return raw bytes + content-type for IDP ingest"),
  correlationId: z.string().optional(),
};

export const webScreenshotSchema = {
  url: z.string().url().describe("Absolute URL to screenshot"),
  correlationId: z.string().optional(),
};

export const webInteractSchema = {
  url: z.string().url(),
  steps: z
    .array(
      z.object({
        action: z.enum(["click", "type", "wait", "navigate"]),
        selector: z.string().optional(),
        text: z.string().optional(),
        ms: z.number().optional(),
        url: z.string().optional(),
      })
    )
    .describe("Browser automation steps"),
  correlationId: z.string().optional(),
};

function textResult(payload: unknown): { content: { type: "text"; text: string }[] } {
  return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] };
}

function toolError(err: unknown): { content: { type: "text"; text: string }[]; isError: true } {
  if (isWebCapabilityError(err)) {
    return {
      content: [{ type: "text", text: JSON.stringify(err.toJSON(), null, 2) }],
      isError: true,
    };
  }
  const message = err instanceof Error ? err.message : String(err);
  return {
    content: [{ type: "text", text: JSON.stringify({ error: { reason: message } }, null, 2) }],
    isError: true,
  };
}

export function createWebPlugin(env: NodeJS.ProcessEnv = process.env): Plugin {
  const web = createWebService(env);
  installWebAuditWormSink(env);
  return {
    id: WEB_PLUGIN_ID,
    version: "0.1.0",
    kind: "default",
    onRegister: (api) =>
      Effect.gen(function* () {
        if (!isWebEnabled(env)) return;

        yield* api.registerMcpTool({
          name: "web_search",
          description:
            "Search the web. Uses configured search provider, or falls back to browser-as-search with an audit note.",
          schema: webSearchSchema,
          handler: async (args) => {
            const a = args as { query: string; limit?: number; correlationId?: string };
            logMcpToolShape("web_search", { queryLen: a.query?.length ?? 0, limit: a.limit });
            try {
              const result = await web.search(a.query, {
                limit: a.limit,
                correlationId: a.correlationId,
              });
              return textResult(result);
            } catch (err) {
              return toolError(err);
            }
          },
        });

        yield* api.registerMcpTool({
          name: "web_fetch",
          description:
            "Fetch a URL. Default: clean markdown/text via the browser provider. " +
            "Pass raw=true for bytes + content-type (IDP / pdf-inspector; no browser required).",
          schema: webFetchSchema,
          handler: async (args) => {
            const a = args as {
              url: string;
              format?: "markdown" | "html" | "text";
              raw?: boolean;
              correlationId?: string;
            };
            logMcpToolShape("web_fetch", { url: a.url, raw: a.raw === true });
            try {
              const page = await web.fetch(a.url, {
                format: a.format,
                raw: a.raw,
                correlationId: a.correlationId,
              });
              if (a.raw === true && page.bytes) {
                return textResult({
                  url: page.url,
                  finalUrl: page.finalUrl,
                  contentType: page.contentType,
                  provider: page.provider,
                  byteLength: page.bytes.byteLength,
                  base64: Buffer.from(page.bytes).toString("base64"),
                });
              }
              return textResult(page);
            } catch (err) {
              return toolError(err);
            }
          },
        });

        yield* api.registerMcpTool({
          name: "web_screenshot",
          description:
            "Capture a screenshot of a URL. Requires a browser provider with screenshot support " +
            "(not SearXNG / search-only; fails with NO_BROWSER_PROVIDER or CAPABILITY_UNSUPPORTED).",
          schema: webScreenshotSchema,
          handler: async (args) => {
            const a = args as { url: string; correlationId?: string };
            logMcpToolShape("web_screenshot", { url: a.url });
            try {
              const buf = await web.screenshot(a.url, { correlationId: a.correlationId });
              return textResult({
                url: a.url,
                provider: web.browserProvider?.id,
                bytes: buf.byteLength,
                base64: Buffer.from(buf).toString("base64"),
              });
            } catch (err) {
              return toolError(err);
            }
          },
        });

        yield* api.registerMcpTool({
          name: "web_interact",
          description:
            "Run browser interaction steps on a URL (requires chromium/playwright/puppeteer). " +
            "Returns structured NO_BROWSER_PROVIDER / CAPABILITY_UNSUPPORTED when unavailable.",
          schema: webInteractSchema,
          handler: async (args) => {
            const a = args as {
              url: string;
              steps: Array<{
                action: "click" | "type" | "wait" | "navigate";
                selector?: string;
                text?: string;
                ms?: number;
                url?: string;
              }>;
              correlationId?: string;
            };
            logMcpToolShape("web_interact", { url: a.url, steps: a.steps?.length ?? 0 });
            try {
              const steps = (a.steps ?? []).map((s) => {
                if (s.action === "click") return { action: "click" as const, selector: s.selector ?? "" };
                if (s.action === "type")
                  return { action: "type" as const, selector: s.selector ?? "", text: s.text ?? "" };
                if (s.action === "wait") return { action: "wait" as const, ms: s.ms ?? 0 };
                return { action: "navigate" as const, url: s.url ?? a.url };
              });
              const page = await web.interact(a.url, steps, { correlationId: a.correlationId });
              return textResult(page);
            } catch (err) {
              return toolError(err);
            }
          },
        });
      }),
  };
}
