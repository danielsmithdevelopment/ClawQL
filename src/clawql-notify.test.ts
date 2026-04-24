import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetSpecCache } from "./spec-loader.js";
import { handleNotifyToolInput, resetSchemaFieldCache } from "./tools.js";

const { mockFetch } = vi.hoisted(() => ({
  mockFetch: vi.fn(),
}));

vi.mock("node-fetch", () => ({
  default: (...args: unknown[]) => mockFetch(...args),
}));

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const minimalSpec = join(here, "test-utils", "fixtures", "minimal-petstore.json");
const slackSpec = join(root, "providers", "slack", "openapi.json");

function slackJsonResponse(obj: unknown) {
  return {
    ok: true,
    status: 200,
    text: async () => JSON.stringify(obj),
  };
}

describe("handleNotifyToolInput", () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    saved.CLAWQL_SPEC_PATH = process.env.CLAWQL_SPEC_PATH;
    saved.CLAWQL_PROVIDER = process.env.CLAWQL_PROVIDER;
    saved.CLAWQL_SPEC_PATHS = process.env.CLAWQL_SPEC_PATHS;
    saved.CLAWQL_SLACK_TOKEN = process.env.CLAWQL_SLACK_TOKEN;
    saved.SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;
    saved.SLACK_TOKEN = process.env.SLACK_TOKEN;
    saved.CLAWQL_PROVIDER_AUTH_JSON = process.env.CLAWQL_PROVIDER_AUTH_JSON;
    saved.CLAWQL_HTTP_HEADERS = process.env.CLAWQL_HTTP_HEADERS;
    mockFetch.mockReset();
    resetSpecCache();
    resetSchemaFieldCache();
  });

  afterEach(() => {
    for (const key of Object.keys(saved)) {
      const v = saved[key];
      if (v === undefined) delete process.env[key];
      else process.env[key] = v;
    }
    mockFetch.mockReset();
    resetSpecCache();
    resetSchemaFieldCache();
  });

  it("returns a clear error when no Slack token is configured", async () => {
    process.env.CLAWQL_SPEC_PATH = slackSpec;
    delete process.env.CLAWQL_PROVIDER;
    delete process.env.CLAWQL_SPEC_PATHS;
    delete process.env.CLAWQL_SLACK_TOKEN;
    delete process.env.SLACK_BOT_TOKEN;
    delete process.env.SLACK_TOKEN;
    delete process.env.CLAWQL_PROVIDER_AUTH_JSON;
    delete process.env.CLAWQL_HTTP_HEADERS;

    const res = await handleNotifyToolInput({ channel: "C01234567", text: "hello" });
    const j = JSON.parse(res.content[0]!.text) as { error?: string };
    expect(j.error).toMatch(/token/i);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns a clear error when the loaded spec has no chat.postMessage", async () => {
    process.env.CLAWQL_SPEC_PATH = minimalSpec;
    delete process.env.CLAWQL_PROVIDER;
    delete process.env.CLAWQL_SPEC_PATHS;
    process.env.CLAWQL_SLACK_TOKEN = "xoxb-test-not-a-real-token";

    const res = await handleNotifyToolInput({ channel: "C01234567", text: "hello" });
    const j = JSON.parse(res.content[0]!.text) as { error?: string };
    expect(j.error).toMatch(/chat_postMessage|chat\.postMessage/i);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("rejects empty or whitespace-only channel", async () => {
    process.env.CLAWQL_SPEC_PATH = slackSpec;
    delete process.env.CLAWQL_PROVIDER;
    delete process.env.CLAWQL_SPEC_PATHS;
    process.env.CLAWQL_SLACK_TOKEN = "xoxb-test";

    const res = await handleNotifyToolInput({ channel: "   ", text: "hello" });
    const j = JSON.parse(res.content[0]!.text) as { error?: string };
    expect(j.error).toMatch(/channel.*text|required/i);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("rejects empty or whitespace-only text", async () => {
    process.env.CLAWQL_SPEC_PATH = slackSpec;
    delete process.env.CLAWQL_PROVIDER;
    delete process.env.CLAWQL_SPEC_PATHS;
    process.env.CLAWQL_SLACK_TOKEN = "xoxb-test";

    const res = await handleNotifyToolInput({ channel: "C01234567", text: "\t" });
    const j = JSON.parse(res.content[0]!.text) as { error?: string };
    expect(j.error).toMatch(/channel.*text|required/i);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  /**
   * Multi-spec forces REST `execute` → `node-fetch`, so we can assert Slack JSON handling
   * without depending on in-process GraphQL for Slack.
   */
  describe("REST path (multi-spec + mocked fetch)", () => {
    beforeEach(() => {
      delete process.env.CLAWQL_SPEC_PATH;
      delete process.env.CLAWQL_PROVIDER;
      process.env.CLAWQL_SPEC_PATHS = [slackSpec, minimalSpec].join(",");
      process.env.CLAWQL_SLACK_TOKEN = "xoxb-test-token";
      resetSpecCache();
    });

    it("returns trimmed Slack success JSON when Slack responds ok:true", async () => {
      mockFetch.mockResolvedValueOnce(
        slackJsonResponse({
          ok: true,
          channel: "C01234567",
          ts: "1713898123.000200",
          message: { text: "hello" },
        }) as never
      );

      const res = await handleNotifyToolInput({ channel: "C01234567", text: "hello" });
      expect(mockFetch).toHaveBeenCalledTimes(1);
      const j = JSON.parse(res.content[0]!.text) as {
        ok?: boolean;
        channel?: string;
        ts?: string;
        message?: unknown;
      };
      expect(j.ok).toBe(true);
      expect(j.channel).toBe("C01234567");
      expect(j.ts).toBe("1713898123.000200");
      expect(j.message).toEqual({ text: "hello" });
    });

    it("maps Slack ok:false JSON to a tool error with slack payload", async () => {
      mockFetch.mockResolvedValueOnce(
        slackJsonResponse({
          ok: false,
          error: "channel_not_found",
        }) as never
      );

      const res = await handleNotifyToolInput({ channel: "C01234567", text: "hello" });
      const j = JSON.parse(res.content[0]!.text) as {
        error?: string;
        slack?: { ok?: boolean; error?: string };
      };
      expect(j.error).toBe("channel_not_found");
      expect(j.slack?.ok).toBe(false);
      expect(j.slack?.error).toBe("channel_not_found");
    });

    it("includes thread_ts in the outbound form body", async () => {
      let body = "";
      mockFetch.mockImplementationOnce(async (_url: unknown, init?: { body?: string }) => {
        body = typeof init?.body === "string" ? init.body : "";
        return slackJsonResponse({
          ok: true,
          channel: "C01234567",
          ts: "1713898123.000201",
          message: {},
        }) as never;
      });

      await handleNotifyToolInput({
        channel: "C01234567",
        text: "in thread",
        thread_ts: "1713898000.000100",
      });
      expect(body).toContain("thread_ts=");
      expect(decodeURIComponent(body)).toContain("1713898000.000100");
    });
  });
});
