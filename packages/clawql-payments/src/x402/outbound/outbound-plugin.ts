/**
 * Outbound x402 payer plugin — registers named batch start tool + spend-cap hook.
 * Gated by CLAWQL_PAYMENTS_OUTBOUND=1.
 */

import { resolveSecretStore } from "clawql-auth";
import {
  defineRegisteringProviderPlugin,
  ExecuteBatchRegistry,
  type ProviderPlugin,
} from "clawql-core";
import { Effect, Layer } from "effect";
import { z } from "zod";
import {
  createOutboundX402PayBatchScript,
  createOutboundX402PayTestLayer,
  OUTBOUND_X402_PAY_BATCH_NAME,
  type OutboundBatchLayerServices,
} from "./batch-script.js";
import { createMemoryOutboundSpendCounterLayer } from "./counters.js";
import { createMemoryOutboundPolicyStoreLayer } from "./policy-store.js";
import { createX402SignerLayer } from "./signer-service.js";
import { createSpendCapEnforceOutboundHook } from "./spend-cap-hook.js";

export const PAYMENTS_OUTBOUND_X402_PLUGIN_ID = "payments-outbound-x402";

function parseTruthy(value: string | undefined): boolean {
  if (!value) return false;
  const n = value.trim().toLowerCase();
  return n === "1" || n === "true" || n === "yes" || n === "on";
}

export function paymentsOutboundX402Enabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return parseTruthy(env.CLAWQL_PAYMENTS_OUTBOUND);
}

export type PaymentsOutboundX402PluginOptions = {
  readonly env?: NodeJS.ProcessEnv;
  readonly paymentsLayer?: Layer.Layer<OutboundBatchLayerServices>;
};

function defaultPaymentsLayer(env: NodeJS.ProcessEnv): Layer.Layer<OutboundBatchLayerServices> {
  const signerMode =
    env.CLAWQL_X402_OUTBOUND_SIGNER?.trim().toLowerCase() === "dry-run"
      ? ("dry-run" as const)
      : ("secret-store" as const);
  return Layer.mergeAll(
    createMemoryOutboundPolicyStoreLayer(),
    createMemoryOutboundSpendCounterLayer(),
    createX402SignerLayer({
      mode: signerMode,
      env,
      secretStore: signerMode === "secret-store" ? resolveSecretStore() : undefined,
    })
  );
}

/**
 * Provider plugin: spend-cap hook + MCP tool `execute_batch` for `outbound-x402-pay`.
 * Not `payments_pay_and_fetch` — model starts the named batch only.
 */
export function createPaymentsOutboundX402Plugin(
  options: PaymentsOutboundX402PluginOptions = {}
): ProviderPlugin {
  const env = options.env ?? process.env;
  const paymentsLayer = options.paymentsLayer ?? defaultPaymentsLayer(env);
  const spendCapHook = createSpendCapEnforceOutboundHook();

  return defineRegisteringProviderPlugin({
    id: PAYMENTS_OUTBOUND_X402_PLUGIN_ID,
    version: "0.1.0",
    description: "Outbound x402 payer batch (outbound-x402-pay) + spend-cap-enforce",
    hooks: [spendCapHook],
    register: (api) =>
      Effect.gen(function* () {
        yield* api.registerMcpTool({
          name: "execute_batch",
          description:
            "Start a named execute-batch script. Terminal result only. Use batchName outbound-x402-pay for third-party 402 payment.",
          schema: {
            batchName: z.string().describe("Named batch id, e.g. outbound-x402-pay"),
            tenantId: z.string(),
            agentId: z.string(),
            sessionId: z.string(),
            resourceUrl: z.string().url().optional(),
            method: z.string().optional(),
            body: z.string().optional(),
            hitlApproval: z
              .object({
                quoteDigest: z.string(),
                approvedAt: z.string(),
              })
              .optional(),
            expectedQuoteDigest: z.string().optional(),
          },
          handler: async (argsUnknown) => {
            const args = argsUnknown as {
              batchName: string;
              tenantId: string;
              agentId: string;
              sessionId: string;
              resourceUrl?: string;
              method?: string;
              body?: string;
              hitlApproval?: { quoteDigest: string; approvedAt: string };
              expectedQuoteDigest?: string;
            };
            if (args.batchName !== OUTBOUND_X402_PAY_BATCH_NAME) {
              return {
                content: [
                  {
                    type: "text" as const,
                    text: JSON.stringify({
                      ok: false,
                      reason: `unsupported_batch:${args.batchName}`,
                      supported: [OUTBOUND_X402_PAY_BATCH_NAME],
                    }),
                  },
                ],
              };
            }
            if (!paymentsOutboundX402Enabled(env)) {
              return {
                content: [
                  {
                    type: "text" as const,
                    text: JSON.stringify({
                      ok: false,
                      reason: "outbound_disabled",
                      hint: "Set CLAWQL_PAYMENTS_OUTBOUND=1",
                    }),
                  },
                ],
              };
            }
            if (!args.resourceUrl) {
              return {
                content: [
                  {
                    type: "text" as const,
                    text: JSON.stringify({ ok: false, reason: "resourceUrl_required" }),
                  },
                ],
              };
            }

            const script = createOutboundX402PayBatchScript({
              env,
              provideLayer: paymentsLayer,
            });
            const result = await Effect.runPromise(
              script.run({
                tenantId: args.tenantId,
                agentId: args.agentId,
                sessionId: args.sessionId,
                payload: {
                  resourceUrl: args.resourceUrl,
                  method: args.method,
                  body: args.body,
                  hitlApproval: args.hitlApproval,
                  expectedQuoteDigest: args.expectedQuoteDigest,
                },
              })
            );

            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify({
                    terminal: result.terminal,
                    batch: {
                      batchId: result.batch.batchId,
                      batchName: result.batch.batchName,
                      success: result.batch.success,
                      failureReason: result.batch.failureReason,
                      payment: result.batch.payment
                        ? {
                            kind: result.batch.payment.kind,
                            quoteDigest: result.batch.payment.quoteDigest,
                            amount: result.batch.payment.amount,
                            hookDecision: result.batch.payment.hookDecision,
                            payee: result.batch.payment.payee,
                            payer: result.batch.payment.payer,
                          }
                        : undefined,
                    },
                  }),
                },
              ],
            };
          },
        });
      }),
  });
}

export function maybeOutboundX402Plugin(
  env: NodeJS.ProcessEnv = process.env
): ProviderPlugin | undefined {
  if (!paymentsOutboundX402Enabled(env)) return undefined;
  return createPaymentsOutboundX402Plugin({ env });
}

/** Hosts with ExecuteBatchRegistry can register the script into the core runner. */
export function registerOutboundX402PayIntoRegistry(
  env: NodeJS.ProcessEnv = process.env
): Effect.Effect<void, never, ExecuteBatchRegistry> {
  return Effect.gen(function* () {
    const reg = yield* ExecuteBatchRegistry;
    const script = createOutboundX402PayBatchScript({
      env,
      provideLayer: createOutboundX402PayTestLayer({ env }),
    });
    yield* reg.register(script);
  });
}
