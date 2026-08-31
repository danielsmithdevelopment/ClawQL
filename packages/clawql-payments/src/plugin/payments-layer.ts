import type {
  ClawQLError,
  McpToolAlreadyRegisteredError,
  PluginAlreadyRegisteredError,
  PluginInstallError,
} from "clawql-core";
import { ClawQLApi } from "clawql-api";
import { Effect, Layer } from "effect";
import {
  paymentsServicesLiveLayer,
  type PaymentsServices,
} from "../runtime/payments-effect-runtime.js";
import { createPaymentsX402ProxyPlugin } from "./payments-x402-proxy-plugin.js";

export type PaymentsLayerError =
  PluginAlreadyRegisteredError | PluginInstallError | ClawQLError | McpToolAlreadyRegisteredError;

export type MakePaymentsLayerOptions = {
  readonly env?: NodeJS.ProcessEnv;
  /** When false, skip registering the x402 MCP proxy plugin (e.g. already in sync `plugins`). */
  readonly registerX402ProxyPlugin?: boolean;
};

/**
 * Horizontal payments Layer: full payments services + optional x402 MCP proxy plugin registration.
 * Prefer sync `defaultPaymentsProxyPlugins()` at the MCP composition root; use this Layer
 * when embedding payments in custom `createClawQLApi({ pluginLayers })` hosts.
 */
export function makePaymentsLayer(
  options: MakePaymentsLayerOptions = {}
): Layer.Layer<PaymentsServices, PaymentsLayerError, ClawQLApi> {
  const env = options.env ?? process.env;
  const registerX402 = options.registerX402ProxyPlugin ?? false;

  const registerPluginLayer = registerX402
    ? Layer.effectDiscard(
        Effect.gen(function* () {
          const claw = yield* ClawQLApi;
          yield* claw.registerPlugin(createPaymentsX402ProxyPlugin({ env }));
        })
      )
    : Layer.empty;

  return Layer.mergeAll(paymentsServicesLiveLayer(env), registerPluginLayer);
}
