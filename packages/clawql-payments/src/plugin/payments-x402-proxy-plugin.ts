/**
 * Payments x402 MCP proxy plugin — routes in-process x402 enforcement through pre-execute hooks.
 */

import {
  defineRegisteringProviderPlugin,
  type HookResult,
  type ProviderPlugin,
} from "clawql-core";
import { Effect } from "effect";
import { isX402EnforcementActive } from "../x402/config.js";
import { mcpX402BeforeCallToolEffect } from "../x402/mcp-enforce-effect.js";
import { createPaymentsToolsPlugin, paymentsMcpToolsEnabled } from "./payments-tools-plugin.js";

export const PAYMENTS_X402_PROXY_PLUGIN_ID = "payments-x402-mcp-proxy";

export type PaymentsX402ProxyPluginOptions = {
  readonly env?: NodeJS.ProcessEnv;
  /** When true, plugin is registered but does not intercept traffic. */
  readonly passive?: boolean;
};

export function paymentsX402ProxyPluginEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.CLAWQL_PAYMENTS_X402_PROXY_PLUGIN?.trim() !== "0";
}

export function createPaymentsX402ProxyPlugin(
  options: PaymentsX402ProxyPluginOptions = {}
): ProviderPlugin {
  const env = options.env ?? process.env;
  const active = isX402EnforcementActive(env);
  const passive = options.passive ?? !active;

  return defineRegisteringProviderPlugin({
    id: PAYMENTS_X402_PROXY_PLUGIN_ID,
    version: "0.1.0",
    description: "Payments x402 MCP enforcement via pre-execute hooks",
    hooks: passive
      ? undefined
      : [
          {
            id: `${PAYMENTS_X402_PROXY_PLUGIN_ID}:pre-execute`,
            scope: "tool",
            event: "pre-execute",
            toolPattern: ".*",
            blocking: true,
            handler: (ctx) =>
              mcpX402BeforeCallToolEffect({ toolName: ctx.toolName ?? "", env }).pipe(
                Effect.as({ allow: true } satisfies HookResult)
              ),
          },
        ],
    register: () =>
      Effect.sync(() => {
        if (process.env.CLAWQL_PAYMENTS_X402_PROXY_DEBUG?.trim() === "1") {
          process.stderr.write(
            `[clawql-payments] PaymentsX402ProxyPlugin registered (passive=${passive}, active=${active})\n`
          );
        }
      }),
  });
}

/** Default payments MCP plugins (x402 proxy + optional payout/ramp/offramp tools). */
export function defaultPaymentsProxyPlugins(
  env: NodeJS.ProcessEnv = process.env
): readonly ProviderPlugin[] {
  const plugins: ProviderPlugin[] = [];
  if (paymentsX402ProxyPluginEnabled(env)) {
    plugins.push(createPaymentsX402ProxyPlugin({ env }));
  }
  if (paymentsMcpToolsEnabled(env)) {
    plugins.push(createPaymentsToolsPlugin(env));
  }
  return plugins;
}
