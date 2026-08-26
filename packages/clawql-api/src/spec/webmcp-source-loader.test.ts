import { Effect } from "effect";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as webmcpBrowser from "../webmcp/webmcp-browser.js";
import { loadWebmcpSourceOperations } from "./webmcp-source-loader.js";
import {
  getWebmcpSourceBinding,
  registerWebmcpSourceBinding,
  resetWebmcpSourceRegistry,
} from "./webmcp-source-registry.js";
import type { CustomSourceEntry } from "./custom-sources-types.js";
import { executeNativeWebmcp } from "../execute/native-webmcp.js";
import type { Operation } from "./operation-types.js";

describe("webmcp source adapter", () => {
  const openSpy = vi.spyOn(webmcpBrowser, "openWebmcpPageSessionEffect");
  const discoverSpy = vi.spyOn(webmcpBrowser, "discoverWebmcpToolsEffect");
  const executeSpy = vi.spyOn(webmcpBrowser, "executeWebmcpToolEffect");

  beforeEach(() => {
    openSpy.mockReset();
    discoverSpy.mockReset();
    executeSpy.mockReset();
    resetWebmcpSourceRegistry();
  });

  afterEach(() => {
    resetWebmcpSourceRegistry();
  });

  it("loads WebMCP tools as operations with webmcp protocolKind", async () => {
    const mockSession = {
      send: vi.fn(),
      close: vi.fn().mockResolvedValue(undefined),
    };
    openSpy.mockReturnValue(Effect.succeed(mockSession));
    discoverSpy.mockReturnValue(
      Effect.succeed([
        {
          name: "clawql.docs.page_context",
          title: "Current documentation page",
          description: "Returns pathname and title",
          inputSchema: { type: "object" },
        },
      ])
    );

    const entries: CustomSourceEntry[] = [
      {
        id: "docs",
        name: "ClawQL Docs",
        kind: "webmcp",
        addedAt: new Date().toISOString(),
        url: "https://docs.clawql.com/",
      },
    ];

    const ops = await loadWebmcpSourceOperations(entries);
    expect(ops).toHaveLength(1);
    expect(ops[0]?.protocolKind).toBe("webmcp");
    expect(ops[0]?.id).toBe("webmcp__docs__clawql_docs_page_context");
    expect(ops[0]?.nativeWebmcp?.toolName).toBe("clawql.docs.page_context");
    expect(getWebmcpSourceBinding("docs")).toBeDefined();
  });

  it("executes a WebMCP tool via the registered session", async () => {
    const mockSession = {
      send: vi.fn(),
      close: vi.fn().mockResolvedValue(undefined),
    };
    registerWebmcpSourceBinding({
      sourceId: "docs",
      pageUrl: "https://docs.clawql.com/",
      cdpUrl: "http://127.0.0.1:9222",
      session: mockSession,
    });

    executeSpy.mockReturnValue(Effect.succeed({ pathname: "/learn", title: "Learn" }));

    const op: Operation = {
      id: "webmcp__docs__clawql_docs_page_context",
      method: "WEBMCP",
      path: "/webmcp/docs/clawql.docs.page_context",
      flatPath: "webmcp/docs/clawql.docs.page_context",
      description: "page context",
      resource: "docs",
      parameters: {},
      scopes: [],
      protocolKind: "webmcp",
      nativeWebmcp: {
        sourceId: "docs",
        toolName: "clawql.docs.page_context",
        pageUrl: "https://docs.clawql.com/",
      },
    };

    const result = await executeNativeWebmcp(op, { arguments: {} });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual({ pathname: "/learn", title: "Learn" });
    }
  });
});
