import { describe, expect, it, beforeEach } from "vitest";
import { Effect } from "effect";
import {
  CORE_CELLD_PROXY_HONESTY,
  DEFAULT_CORE_CELLD_MCP_URL,
  callCoreCelldToolEffect,
  coreCelldProxyEnabled,
  coreCelldProxyEnabledAsync,
  preferCoreInCelld,
  probeCoreCelldReachable,
  resetCoreCelldReachCache,
  resolveCoreCelldProxyConfig,
} from "./core-celld-proxy.js";

describe("core-celld-proxy", () => {
  beforeEach(() => {
    resetCoreCelldReachCache();
  });

  it("defaults prefer-celld on; Node escape hatches work", () => {
    expect(preferCoreInCelld({})).toBe(true);
    expect(preferCoreInCelld({ CLAWQL_CORE_IN_CELLD: "0" })).toBe(false);
    expect(preferCoreInCelld({ CLAWQL_FORCE_NODE_CORE: "1" })).toBe(false);
    expect(preferCoreInCelld({ CLAWQL_CORE_IN_CELLD: "1" })).toBe(true);
  });

  it("resolves explicit /mcp URL and default localhost", () => {
    expect(resolveCoreCelldProxyConfig({ CLAWQL_CORE_CELLD_URL: "http://127.0.0.1:9888" })).toEqual({
      url: "http://127.0.0.1:9888/mcp",
      timeoutMs: 15_000,
      usingDefaultUrl: false,
    });
    expect(
      resolveCoreCelldProxyConfig({ CLAWQL_CORE_CELLD_URL: "http://127.0.0.1:9888/mcp" })?.url
    ).toBe("http://127.0.0.1:9888/mcp");
    const def = resolveCoreCelldProxyConfig({});
    expect(def?.url).toBe(DEFAULT_CORE_CELLD_MCP_URL);
    expect(def?.usingDefaultUrl).toBe(true);
    expect(resolveCoreCelldProxyConfig({ CLAWQL_CORE_IN_CELLD: "0" })).toBeNull();
  });

  it("explicit URL enables sync; default URL needs successful probe", async () => {
    expect(coreCelldProxyEnabled({})).toBe(false);
    expect(coreCelldProxyEnabled({ CLAWQL_CORE_CELLD_URL: "http://x/mcp" })).toBe(true);
    expect(
      coreCelldProxyEnabled({
        CLAWQL_CORE_CELLD_URL: "http://x/mcp",
        CLAWQL_CORE_IN_CELLD: "0",
      })
    ).toBe(false);

    const fetchOk = async () => new Response(JSON.stringify({ ok: true }), { status: 200 });
    expect(await coreCelldProxyEnabledAsync({}, fetchOk as unknown as typeof fetch)).toBe(true);
    expect(coreCelldProxyEnabled({})).toBe(true);

    resetCoreCelldReachCache();
    const fetchDown = async () => {
      throw new Error("ECONNREFUSED");
    };
    expect(await probeCoreCelldReachable({}, fetchDown as unknown as typeof fetch)).toBe(false);
    expect(coreCelldProxyEnabled({})).toBe(false);
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
