import { describe, expect, it } from "vitest";
import { Effect } from "effect";
import {
  CORE_CELLD_PROXY_HONESTY,
  callCoreCelldToolEffect,
  coreCelldProxyEnabled,
  resolveCoreCelldProxyConfig,
} from "./core-celld-proxy.js";

describe("core-celld-proxy", () => {
  it("resolves /mcp URL", () => {
    expect(resolveCoreCelldProxyConfig({ CLAWQL_CORE_CELLD_URL: "http://127.0.0.1:9888" })).toEqual({
      url: "http://127.0.0.1:9888/mcp",
      timeoutMs: 15_000,
    });
    expect(
      resolveCoreCelldProxyConfig({ CLAWQL_CORE_CELLD_URL: "http://127.0.0.1:9888/mcp" })?.url
    ).toBe("http://127.0.0.1:9888/mcp");
  });

  it("enabled only with URL (unless CORE_IN_CELLD=0)", () => {
    expect(coreCelldProxyEnabled({})).toBe(false);
    expect(coreCelldProxyEnabled({ CLAWQL_CORE_CELLD_URL: "http://x/mcp" })).toBe(true);
    expect(
      coreCelldProxyEnabled({
        CLAWQL_CORE_CELLD_URL: "http://x/mcp",
        CLAWQL_CORE_IN_CELLD: "0",
      })
    ).toBe(false);
  });

  it("proxies tools/call via fetch", async () => {
    const fetchImpl = async () =>
      new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          result: {
            content: [
              {
                type: "text",
                text: JSON.stringify({ ok: true, transport: "celld-isolate" }),
              },
            ],
          },
        }),
        { status: 200 }
      );
    const out = await Effect.runPromise(
      callCoreCelldToolEffect(
        "search",
        { query: "pets" },
        { CLAWQL_CORE_CELLD_URL: "http://celld/mcp" },
        fetchImpl as unknown as typeof fetch
      )
    );
    expect(out.transport).toBe("celld-isolate-proxy");
    expect(out.honesty).toBe(CORE_CELLD_PROXY_HONESTY);
    const parsed = JSON.parse(out.content[0]!.text) as { proxiedFrom?: string; ok?: boolean };
    expect(parsed.ok).toBe(true);
    expect(parsed.proxiedFrom).toBe("clawql-mcp");
  });
});
