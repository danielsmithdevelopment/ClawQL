/**
 * Register `outbound-x402-pay` with clawql-core ExecuteBatchRegistry.
 */

import {
  ClawQLError,
  type ExecuteBatchArgs,
  type ExecuteBatchResult,
  type ExecuteBatchScript,
  type OutboundPaymentHitlApproval,
} from "clawql-core";
import { Effect, Layer } from "effect";
import {
  createMemoryOutboundSpendCounterLayer,
  OutboundSpendCounterService,
} from "./counters.js";
import {
  createMemoryOutboundPolicyStoreLayer,
  OutboundPolicyStoreService,
} from "./policy-store.js";
import {
  runOutboundX402PayBatchEffect,
  type OutboundX402PayBatchInput,
} from "./pay-batch.js";
import { createX402SignerLayer, X402SignerService } from "./signer-service.js";

export const OUTBOUND_X402_PAY_BATCH_NAME = "outbound-x402-pay";

export type OutboundX402BatchPayload = {
  readonly resourceUrl: string;
  readonly method?: string;
  readonly body?: string;
  readonly headers?: Record<string, string>;
  readonly hitlApproval?: OutboundPaymentHitlApproval;
  readonly expectedQuoteDigest?: string;
};

export type OutboundBatchLayerServices =
  | OutboundPolicyStoreService
  | OutboundSpendCounterService
  | X402SignerService;

/**
 * Build the named batch script. The host provides the payments Layer when running.
 */
export function createOutboundX402PayBatchScript(options: {
  readonly env?: NodeJS.ProcessEnv;
  readonly fetchImpl?: typeof fetch;
  /**
   * When set, the batch Effect is provided this Layer (isolated services).
   * When omitted, callers must already provide OutboundBatchLayerServices.
   */
  readonly provideLayer?: Layer.Layer<OutboundBatchLayerServices>;
}): ExecuteBatchScript {
  return {
    name: OUTBOUND_X402_PAY_BATCH_NAME,
    description:
      "Complete a third-party x402 Payment Required handshake under spend-cap policy",
    run: (args: ExecuteBatchArgs): Effect.Effect<ExecuteBatchResult, ClawQLError | Error> => {
      const payload = (args.payload ?? {}) as OutboundX402BatchPayload;
      if (!payload.resourceUrl?.trim()) {
        return Effect.fail(
          new ClawQLError({ reason: "outbound-x402-pay requires payload.resourceUrl" })
        );
      }
      const input: OutboundX402PayBatchInput = {
        tenantId: args.tenantId,
        agentId: args.agentId,
        sessionId: args.sessionId,
        resourceUrl: payload.resourceUrl,
        method: payload.method,
        body: payload.body,
        headers: payload.headers,
        hitlApproval: payload.hitlApproval,
        expectedQuoteDigest: payload.expectedQuoteDigest,
        env: options.env,
        fetchImpl: options.fetchImpl,
      };

      const base = runOutboundX402PayBatchEffect(input).pipe(
        Effect.map((pay) => ({
          terminal: pay.ok
            ? { ok: true as const, status: pay.status, body: pay.body }
            : { ok: false as const, reason: pay.reason, detail: pay.detail },
          batch: {
            batchId: pay.batch.batchId,
            batchName: pay.batch.batchName,
            tenantId: pay.batch.tenantId,
            agentId: pay.batch.agentId,
            sessionId: pay.batch.sessionId,
            innerCallCount: pay.batch.innerCallCount,
            success: pay.batch.success,
            failureReason: pay.batch.failureReason,
            startedAt: pay.batch.startedAt,
            completedAt: pay.batch.completedAt,
            payment: pay.batch.payment,
          },
        })),
        Effect.mapError(
          (cause) =>
            new ClawQLError({
              reason: "outbound_x402_pay_batch_failed",
              cause,
            })
        )
      );

      if (!options.provideLayer) {
        return base as Effect.Effect<ExecuteBatchResult, ClawQLError | Error>;
      }
      return base.pipe(Effect.provide(options.provideLayer));
    },
  };
}

/** Default in-memory payments Layer for tests / local dry-run. */
export function createOutboundX402PayTestLayer(options?: {
  readonly env?: NodeJS.ProcessEnv;
  readonly secretStore?: import("clawql-auth").SecretStore;
}): Layer.Layer<OutboundBatchLayerServices> {
  return Layer.mergeAll(
    createMemoryOutboundPolicyStoreLayer(),
    createMemoryOutboundSpendCounterLayer(),
    createX402SignerLayer({
      mode: "dry-run",
      env: options?.env,
      secretStore: options?.secretStore,
    })
  );
}
