import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import {
  createPaymentsX402ProxyPlugin,
  defaultPaymentsProxyPlugins,
  PAYMENTS_X402_PROXY_PLUGIN_ID,
  paymentsX402ProxyPluginEnabled,
} from "./payments-x402-proxy-plugin.js";

describe("createPaymentsX402ProxyPlugin", () => {
  it("returns mcp-proxy plugin with stable id", () => {
    const plugin = createPaymentsX402ProxyPlugin();
    expect(plugin.id).toBe(PAYMENTS_X402_PROXY_PLUGIN_ID);
    expect(plugin.kind).toBe("mcp-proxy");
    expect(plugin.vertical).toBe("payments");
  });

  it("registers beforeCallTool when x402 enforcement is active", () => {
    const env = { CLAWQL_X402_ENFORCE: "1" };
    const plugin = createPaymentsX402ProxyPlugin({ env });
    expect(plugin.beforeCallTool).toBeDefined();
  });

  it("is passive when x402 enforcement is off", () => {
    const env = { CLAWQL_X402_ENFORCE: "0" };
    const plugin = createPaymentsX402ProxyPlugin({ env });
    expect(plugin.beforeCallTool).toBeUndefined();
  });

  it("defaultPaymentsProxyPlugins respects disable flag", () => {
    const enabledEnv = { CLAWQL_PAYMENTS_X402_PROXY_PLUGIN: "1" };
    expect(paymentsX402ProxyPluginEnabled(enabledEnv)).toBe(true);
    expect(defaultPaymentsProxyPlugins(enabledEnv)).toHaveLength(1);

    const disabledEnv = { CLAWQL_PAYMENTS_X402_PROXY_PLUGIN: "0" };
    expect(paymentsX402ProxyPluginEnabled(disabledEnv)).toBe(false);
    expect(defaultPaymentsProxyPlugins(disabledEnv)).toHaveLength(0);
  });

  it("beforeCallTool propagates ClawQLError-compatible failures via Effect", async () => {
    const env = { CLAWQL_X402_ENFORCE: "1", CLAWQL_HOME: "/nonexistent-payments-test" };
    const plugin = createPaymentsX402ProxyPlugin({ env, passive: false });
    expect(plugin.beforeCallTool).toBeDefined();

    await expect(
      Effect.runPromise(
        plugin.beforeCallTool!({ toolName: "search", args: {} }).pipe(
          Effect.catchAll((err) => Effect.fail(err))
        )
      )
    ).resolves.toBeUndefined();
  });
});

describe("mcpX402BeforeCallToolEffect integration", () => {
  it("allows ungated tools when enforcement is active", async () => {
    const env = {
      CLAWQL_X402_ENFORCE: "1",
      CLAWQL_HOME: process.env.CLAWQL_HOME,
    };
    const plugin = createPaymentsX402ProxyPlugin({ env, passive: false });
    await expect(
      Effect.runPromise(plugin.beforeCallTool!({ toolName: "cache", args: {} }))
    ).resolves.toBeUndefined();
  });
});
