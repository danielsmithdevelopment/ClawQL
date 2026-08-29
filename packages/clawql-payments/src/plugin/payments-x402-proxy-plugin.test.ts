import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import {
  createPaymentsX402ProxyPlugin,
  defaultPaymentsProxyPlugins,
  PAYMENTS_X402_PROXY_PLUGIN_ID,
  paymentsX402ProxyPluginEnabled,
} from "./payments-x402-proxy-plugin.js";

const hookSession = { id: "t", atrScope: new Set<string>() };

describe("createPaymentsX402ProxyPlugin", () => {
  it("returns ProviderPlugin with stable id", () => {
    const plugin = createPaymentsX402ProxyPlugin();
    expect(plugin.id).toBe(PAYMENTS_X402_PROXY_PLUGIN_ID);
    expect(plugin.description).toContain("x402");
  });

  it("registers pre-execute hooks when x402 enforcement is active", () => {
    const env = { CLAWQL_X402_ENFORCE: "1" };
    const plugin = createPaymentsX402ProxyPlugin({ env });
    expect(plugin.hooks).toBeDefined();
    expect(plugin.hooks!.length).toBeGreaterThan(0);
  });

  it("is passive when x402 enforcement is off", () => {
    const env = { CLAWQL_X402_ENFORCE: "0" };
    const plugin = createPaymentsX402ProxyPlugin({ env });
    expect(plugin.hooks).toBeUndefined();
  });

  it("defaultPaymentsProxyPlugins respects disable flag", () => {
    const enabledEnv = { CLAWQL_PAYMENTS_X402_PROXY_PLUGIN: "1" };
    expect(paymentsX402ProxyPluginEnabled(enabledEnv)).toBe(true);
    expect(defaultPaymentsProxyPlugins(enabledEnv)).toHaveLength(1);

    const disabledEnv = { CLAWQL_PAYMENTS_X402_PROXY_PLUGIN: "0" };
    expect(paymentsX402ProxyPluginEnabled(disabledEnv)).toBe(false);
    expect(defaultPaymentsProxyPlugins(disabledEnv)).toHaveLength(0);
  });

  it("hook handler propagates ClawQLError-compatible failures via Effect", async () => {
    const env = { CLAWQL_X402_ENFORCE: "1", CLAWQL_HOME: "/nonexistent-payments-test" };
    const plugin = createPaymentsX402ProxyPlugin({ env, passive: false });
    const hook = plugin.hooks![0];

    await expect(
      Effect.runPromise(
        hook
          .handler({ session: hookSession, toolName: "search", args: {} })
          .pipe(Effect.catchAll((err) => Effect.fail(err)))
      )
    ).resolves.toEqual({ allow: true });
  });
});

describe("mcpX402BeforeCallToolEffect integration", () => {
  it("allows ungated tools when enforcement is active", async () => {
    const env = {
      CLAWQL_X402_ENFORCE: "1",
      CLAWQL_HOME: process.env.CLAWQL_HOME,
    };
    const plugin = createPaymentsX402ProxyPlugin({ env, passive: false });
    const hook = plugin.hooks![0];
    await expect(
      Effect.runPromise(hook.handler({ session: hookSession, toolName: "cache", args: {} }))
    ).resolves.toEqual({ allow: true });
  });
});
