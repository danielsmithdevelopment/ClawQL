/**
 * Batch script `outbound-x402-pay` — probe → policy → sign → settle.
 * @see docs/specs/execute/execute-batching-v0.1.md#outbound-402-payer
 */

import { randomUUID } from "node:crypto";
import { type OutboundPaymentHitlApproval, OutboundPolicyError } from "clawql-core";
import { Effect, Layer } from "effect";
import { X402Error } from "../../errors/payment-errors.js";
import { resolveFacilitatorEndpoint } from "../x402-runtime-config-service.js";
import { OutboundSpendCounterService, utcDayKey, type SpendCounterKey } from "./counters.js";
import { OutboundPolicyStoreService } from "./policy-store.js";
import { computeQuoteDigest, quoteFromTerms } from "./quote.js";
import { X402SignerService } from "./signer-service.js";
import { evaluateSpendCapOutboundEffect } from "./spend-cap-hook.js";
import type {
  ExecuteBatchCompletedFields,
  ExecuteBatchPaymentFields,
  OutboundX402FailureReason,
  OutboundX402PayResult,
  OutboundX402QuoteTerms,
} from "./types.js";

export type OutboundX402PayBatchInput = {
  readonly tenantId: string;
  readonly agentId: string;
  readonly sessionId: string;
  readonly resourceUrl: string;
  readonly method?: string;
  readonly body?: string;
  readonly headers?: Record<string, string>;
  readonly hitlApproval?: OutboundPaymentHitlApproval;
  readonly env?: NodeJS.ProcessEnv;
  readonly fetchImpl?: typeof fetch;
  /** Expected quote digest — reject if server terms differ. */
  readonly expectedQuoteDigest?: string;
};

type OutboundBatchServices =
  OutboundPolicyStoreService | OutboundSpendCounterService | X402SignerService;

function isOutboundEnabled(env: NodeJS.ProcessEnv): boolean {
  const raw = env.CLAWQL_PAYMENTS_OUTBOUND?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

function parsePaymentRequired(body: string, headers?: Headers): OutboundX402QuoteTerms | null {
  const fromBody = parsePaymentRequiredJson(body);
  if (fromBody) return fromBody;
  const header =
    headers?.get("PAYMENT-REQUIRED") ??
    headers?.get("payment-required") ??
    headers?.get("X-PAYMENT-REQUIRED");
  if (!header?.trim()) return null;
  try {
    const decoded = Buffer.from(header.trim(), "base64").toString("utf8");
    return parsePaymentRequiredJson(decoded);
  } catch {
    try {
      return parsePaymentRequiredJson(header);
    } catch {
      return null;
    }
  }
}

function parsePaymentRequiredJson(body: string): OutboundX402QuoteTerms | null {
  try {
    const json = JSON.parse(body) as {
      accepts?: Array<Record<string, unknown>>;
    };
    const first = json.accepts?.[0];
    if (!first) return null;
    const amount = first.amount ?? first.maxAmountRequired;
    const payTo = first.payTo;
    const network = first.network;
    const asset = first.asset;
    const scheme = first.scheme ?? "exact";
    if (
      typeof amount !== "string" ||
      typeof payTo !== "string" ||
      typeof network !== "string" ||
      typeof asset !== "string"
    ) {
      return null;
    }
    return {
      scheme: String(scheme),
      network,
      amountAtomic: amount,
      asset,
      payTo,
      maxTimeoutSeconds:
        typeof first.maxTimeoutSeconds === "number" ? first.maxTimeoutSeconds : undefined,
      extra:
        first.extra && typeof first.extra === "object"
          ? (first.extra as Record<string, string>)
          : undefined,
    };
  } catch {
    return null;
  }
}

function batchBase(input: {
  batchId: string;
  tenantId: string;
  agentId: string;
  sessionId: string;
  startedAt: string;
  innerCallCount: number;
  success: boolean;
  failureReason?: OutboundX402FailureReason;
  payment?: ExecuteBatchPaymentFields;
}): ExecuteBatchCompletedFields {
  return {
    batchId: input.batchId,
    batchName: "outbound-x402-pay",
    tenantId: input.tenantId,
    agentId: input.agentId,
    sessionId: input.sessionId,
    innerCallCount: input.innerCallCount,
    success: input.success,
    failureReason: input.failureReason,
    startedAt: input.startedAt,
    completedAt: new Date().toISOString(),
    payment: input.payment,
  };
}

function failResult(
  batch: ExecuteBatchCompletedFields,
  reason: OutboundX402FailureReason,
  detail?: string
): OutboundX402PayResult {
  return {
    ok: false,
    reason,
    detail,
    batch: { ...batch, success: false, failureReason: reason },
  };
}

/**
 * Run the outbound-x402-pay batch under Effect services.
 * Injectable `fetchImpl` for unit tests.
 */
export function runOutboundX402PayBatchEffect(
  input: OutboundX402PayBatchInput
): Effect.Effect<OutboundX402PayResult, never, OutboundBatchServices> {
  return Effect.gen(function* () {
    const env = input.env ?? process.env;
    const fetchImpl = input.fetchImpl ?? fetch;
    const method = (input.method ?? "GET").toUpperCase();
    const batchId = randomUUID();
    const startedAt = new Date().toISOString();
    let innerCallCount = 0;

    const mkBatch = (opts: {
      success: boolean;
      failureReason?: OutboundX402FailureReason;
      payment?: ExecuteBatchPaymentFields;
    }) =>
      batchBase({
        batchId,
        tenantId: input.tenantId,
        agentId: input.agentId,
        sessionId: input.sessionId,
        startedAt,
        innerCallCount,
        ...opts,
      });

    if (!isOutboundEnabled(env)) {
      return failResult(mkBatch({ success: false }), "outbound_disabled");
    }

    innerCallCount += 1;
    const probe = yield* Effect.tryPromise({
      try: () =>
        fetchImpl(input.resourceUrl, {
          method,
          headers: input.headers,
          body: method === "GET" || method === "HEAD" ? undefined : input.body,
        }),
      catch: (cause) => new X402Error({ reason: "probe_fetch_failed", cause }),
    }).pipe(Effect.catchAll(() => Effect.succeed(null as Response | null)));

    if (!probe) {
      return failResult(mkBatch({ success: false }), "network_error", "probe_failed");
    }

    if (probe.status !== 402) {
      const body = yield* Effect.tryPromise({
        try: () => probe.text(),
        catch: () => new X402Error({ reason: "probe_body_read_failed" }),
      }).pipe(Effect.catchAll(() => Effect.succeed("")));
      return {
        ok: true as const,
        status: probe.status,
        body,
        batch: mkBatch({ success: true }),
      };
    }

    const probeBody = yield* Effect.tryPromise({
      try: () => probe.text(),
      catch: () => new X402Error({ reason: "probe_body_read_failed" }),
    }).pipe(Effect.catchAll(() => Effect.succeed("")));

    const terms = parsePaymentRequired(probeBody, probe.headers);
    if (!terms) {
      return failResult(
        mkBatch({ success: false }),
        "quote_mismatch",
        "unparseable_payment_required"
      );
    }

    const digest = computeQuoteDigest(terms);
    if (input.expectedQuoteDigest && input.expectedQuoteDigest !== digest) {
      return failResult(mkBatch({ success: false }), "quote_mismatch", "expected_digest_mismatch");
    }

    const quoteOrErr = yield* quoteFromTerms(terms).pipe(
      Effect.map((q) => ({ ok: true as const, q })),
      Effect.catchAll((err: OutboundPolicyError) =>
        Effect.succeed({ ok: false as const, reason: err.reason })
      )
    );
    if (!quoteOrErr.ok) {
      return failResult(mkBatch({ success: false }), "quote_mismatch", quoteOrErr.reason);
    }
    const quote = quoteOrErr.q;

    const evaluated = yield* evaluateSpendCapOutboundEffect({
      tenantId: input.tenantId,
      agentId: input.agentId,
      sessionId: input.sessionId,
      args: {
        kind: "outbound_payment",
        tenantId: input.tenantId,
        agentId: input.agentId,
        resourceUrl: input.resourceUrl,
        method,
        quote,
        hitlApproval: input.hitlApproval,
      },
    }).pipe(
      Effect.catchAll((err: OutboundPolicyError) =>
        Effect.succeed({
          result: {
            allow: false as const,
            denyReason: err.reason,
            meta: { hookDecision: "deny" as const },
          },
          policyVersionId: "",
          decision: { decision: "deny" as const, reason: err.reason },
        })
      )
    );

    const hookDecision =
      evaluated.decision.decision === "allow"
        ? ("allow" as const)
        : evaluated.decision.decision === "hitl"
          ? ("hitl" as const)
          : ("deny" as const);

    const paymentStub = (
      extra: Partial<ExecuteBatchPaymentFields> = {}
    ): ExecuteBatchPaymentFields => ({
      kind: "outbound_payment",
      protocol: "x402",
      resourceUrl: input.resourceUrl,
      method,
      quoteDigest: digest,
      amount: quote.amountUsdc,
      asset: terms.asset,
      network: terms.network,
      payer: "",
      payee: terms.payTo,
      facilitator: env.CLAWQL_X402_FACILITATOR_URL?.trim() || "",
      hookDecision,
      hookPolicyVersion: evaluated.policyVersionId,
      tenantId: input.tenantId,
      agentId: input.agentId,
      sessionId: input.sessionId,
      ...extra,
    });

    if (evaluated.decision.decision === "hitl") {
      return failResult(
        mkBatch({ success: false, payment: paymentStub() }),
        "hitl_required",
        evaluated.decision.reason
      );
    }
    if (evaluated.decision.decision === "deny" || !evaluated.result.allow) {
      return failResult(
        mkBatch({ success: false, payment: paymentStub() }),
        evaluated.decision.reason === "policy_missing" ? "policy_missing" : "policy_denied",
        evaluated.decision.reason
      );
    }

    const counters = yield* OutboundSpendCounterService;
    const counterKey: SpendCounterKey = {
      tenantId: input.tenantId,
      agentId: input.agentId,
      sessionId: input.sessionId,
      dayKey: utcDayKey(),
    };

    const reserveOk = yield* counters.reserve(counterKey, quote.amountUsdc).pipe(
      Effect.as(true as const),
      Effect.catchAll(() => Effect.succeed(false as const))
    );
    if (!reserveOk) {
      return failResult(
        mkBatch({ success: false, payment: paymentStub() }),
        "policy_denied",
        "counter_error"
      );
    }

    const signer = yield* X402SignerService;
    const frozen = yield* signer
      .isFrozen(input.sessionId, input.tenantId, input.agentId)
      .pipe(Effect.catchAll(() => Effect.succeed(true)));
    if (frozen) {
      yield* counters
        .releaseReserved(counterKey, quote.amountUsdc)
        .pipe(Effect.catchAll(() => Effect.void));
      return failResult(mkBatch({ success: false, payment: paymentStub() }), "signer_frozen");
    }

    const signedOrFail = yield* signer
      .sign({
        tenantId: input.tenantId,
        agentId: input.agentId,
        sessionId: input.sessionId,
        resourceUrl: input.resourceUrl,
        quote: terms,
        quoteDigest: digest,
      })
      .pipe(
        Effect.map((s) => ({ ok: true as const, s })),
        Effect.catchAll((err) =>
          Effect.succeed({
            ok: false as const,
            reason: String((err as { reason?: string }).reason ?? err),
          })
        )
      );

    if (!signedOrFail.ok) {
      yield* counters
        .releaseReserved(counterKey, quote.amountUsdc)
        .pipe(Effect.catchAll(() => Effect.void));
      return failResult(
        mkBatch({ success: false, payment: paymentStub() }),
        "sign_failed",
        signedOrFail.reason
      );
    }
    const signed = signedOrFail.s;

    innerCallCount += 1;
    const paidHeaders = {
      ...input.headers,
      "PAYMENT-SIGNATURE": signed.paymentHeader,
      "X-PAYMENT": signed.paymentHeader,
    };

    const paid = yield* Effect.tryPromise({
      try: () =>
        fetchImpl(input.resourceUrl, {
          method,
          headers: paidHeaders,
          body: method === "GET" || method === "HEAD" ? undefined : input.body,
        }),
      catch: (cause) => new X402Error({ reason: "paid_fetch_failed", cause }),
    }).pipe(Effect.catchAll(() => Effect.succeed(null as Response | null)));

    if (!paid) {
      yield* signer
        .freezeForSession(input.sessionId, input.tenantId, input.agentId, "timeout_after_sign")
        .pipe(Effect.catchAll(() => Effect.void));
      return failResult(
        mkBatch({
          success: false,
          payment: paymentStub({ payer: signed.payerAddress }),
        }),
        "settle_unconfirmed",
        "paid_fetch_timeout"
      );
    }

    const facilitatorUrl = env.CLAWQL_X402_FACILITATOR_URL?.trim();
    if (facilitatorUrl) {
      const verifyUrl = resolveFacilitatorEndpoint(facilitatorUrl, "verify");
      const verifyRes = yield* Effect.tryPromise({
        try: async () => {
          const paymentPayload = JSON.parse(
            Buffer.from(signed.paymentHeader, "base64").toString("utf8")
          );
          return fetchImpl(verifyUrl, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              x402Version: 2,
              paymentPayload,
              paymentRequirements: {
                scheme: terms.scheme,
                network: terms.network,
                amount: terms.amountAtomic,
                asset: terms.asset,
                payTo: terms.payTo,
                maxTimeoutSeconds: terms.maxTimeoutSeconds,
              },
            }),
          });
        },
        catch: (cause) => new X402Error({ reason: "facilitator_verify_failed", cause }),
      }).pipe(Effect.catchAll(() => Effect.succeed(null as Response | null)));

      if (!verifyRes) {
        yield* signer
          .freezeForSession(
            input.sessionId,
            input.tenantId,
            input.agentId,
            "facilitator_unreachable_after_sign"
          )
          .pipe(Effect.catchAll(() => Effect.void));
        return failResult(
          mkBatch({
            success: false,
            payment: paymentStub({ payer: signed.payerAddress }),
          }),
          "settle_unconfirmed",
          "facilitator_unreachable"
        );
      }

      const verifyJson = yield* Effect.tryPromise({
        try: () => verifyRes.json() as Promise<{ isValid?: boolean; invalidReason?: string }>,
        catch: () => new X402Error({ reason: "facilitator_json_failed" }),
      }).pipe(Effect.catchAll(() => Effect.succeed({ isValid: false as boolean })));

      if (!verifyJson.isValid) {
        yield* counters
          .releaseReserved(counterKey, quote.amountUsdc)
          .pipe(Effect.catchAll(() => Effect.void));
        return failResult(
          mkBatch({
            success: false,
            payment: paymentStub({ payer: signed.payerAddress }),
          }),
          "facilitator_rejected",
          "invalidReason" in verifyJson ? verifyJson.invalidReason : undefined
        );
      }
    }

    if (paid.status === 402) {
      yield* counters
        .releaseReserved(counterKey, quote.amountUsdc)
        .pipe(Effect.catchAll(() => Effect.void));
      return failResult(
        mkBatch({
          success: false,
          payment: paymentStub({ payer: signed.payerAddress }),
        }),
        "quote_mismatch",
        "still_402_after_payment"
      );
    }

    const paidBody = yield* Effect.tryPromise({
      try: () => paid.text(),
      catch: () => new X402Error({ reason: "paid_body_read_failed" }),
    }).pipe(Effect.catchAll(() => Effect.succeed("")));

    yield* counters
      .settleReserved(counterKey, quote.amountUsdc)
      .pipe(Effect.catchAll(() => Effect.void));

    const store = yield* OutboundPolicyStoreService;
    yield* store.markOutboundEnabled(input.tenantId, evaluated.policyVersionId);

    return {
      ok: true as const,
      status: paid.status,
      body: paidBody,
      batch: mkBatch({
        success: true,
        payment: paymentStub({ payer: signed.payerAddress, hookDecision: "allow" }),
      }),
    };
  }).pipe(
    Effect.catchAllDefect(() =>
      Effect.succeed(
        failResult(
          batchBase({
            batchId: randomUUID(),
            tenantId: input.tenantId,
            agentId: input.agentId,
            sessionId: input.sessionId,
            startedAt: new Date().toISOString(),
            innerCallCount: 0,
            success: false,
            failureReason: "network_error",
          }),
          "network_error",
          "defect"
        )
      )
    )
  );
}

/** Thin Promise façade for hosts (absolute boundary). */
export function runOutboundX402PayBatch(
  input: OutboundX402PayBatchInput,
  layer: Layer.Layer<OutboundBatchServices>
): Promise<OutboundX402PayResult> {
  return Effect.runPromise(runOutboundX402PayBatchEffect(input).pipe(Effect.provide(layer)));
}
