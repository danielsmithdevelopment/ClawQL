/**
 * Classify Stripe invoice / subscription signals for dunning + proration ops.
 * Stripe owns Smart Retries; ClawQL records structured WORM evidence and operator runbooks.
 */
import { Context, Effect, Layer } from "effect";

/** Why Stripe opened the invoice — drives proration vs recurring cycle handling. */
export type StripeBillingReason =
  | "subscription_cycle"
  | "subscription_create"
  | "subscription_update"
  | "subscription_threshold"
  | "manual"
  | "upcoming"
  | "other";

/** Operator-facing dunning stage derived from invoice retry fields. */
export type DunningStage =
  "first_failure" | "retrying" | "exhausted" | "recovered" | "past_due" | "unpaid" | "canceled";

export type InvoiceDunningSignal = {
  readonly billingReason: StripeBillingReason;
  readonly isProration: boolean;
  readonly stage: DunningStage;
  readonly attemptCount: number;
  readonly nextPaymentAttemptUnix: number | null;
  readonly invoiceId: string;
  readonly subscriptionId: string | null;
  readonly customerId: string | null;
  readonly amountDueUsd: number;
  readonly hostedInvoiceUrl: string | null;
};

export type SubscriptionDunningSignal = {
  readonly stage: Extract<DunningStage, "past_due" | "unpaid" | "canceled" | "recovered">;
  readonly subscriptionId: string;
  readonly customerId: string | null;
  readonly status: string;
};

function normalizeBillingReason(raw: string | null | undefined): StripeBillingReason {
  const v = (raw ?? "").trim();
  switch (v) {
    case "subscription_cycle":
    case "subscription_create":
    case "subscription_update":
    case "subscription_threshold":
    case "manual":
    case "upcoming":
      return v;
    default:
      return "other";
  }
}

export type ClassifyFailedInvoiceInput = {
  readonly id?: string | null;
  readonly billing_reason?: string | null;
  readonly attempt_count?: number | null;
  readonly next_payment_attempt?: number | null;
  readonly amount_due?: number | null;
  readonly hosted_invoice_url?: string | null;
  readonly customer?: string | { id?: string } | null;
  readonly subscription?: string | { id?: string } | null;
  /**
   * Opaque Stripe line list — do not require `proration` on the element type
   * (Stripe.InvoiceLineItem shapes vary by API version).
   */
  readonly lines?: { data?: ReadonlyArray<unknown> } | null;
};

function idFromStripeRef(ref: string | { id?: string } | null | undefined): string | null {
  if (!ref) return null;
  if (typeof ref === "string") return ref.trim() || null;
  return ref.id?.trim() || null;
}

/** True when a line looks like a proration (legacy top-level or parent.subscription_item_details). */
export function lineLooksProrated(line: unknown): boolean {
  if (!line || typeof line !== "object") return false;
  const l = line as {
    proration?: unknown;
    parent?: { subscription_item_details?: { proration?: unknown } };
  };
  if (l.proration === true) return true;
  if (l.parent?.subscription_item_details?.proration === true) return true;
  return false;
}

/**
 * Narrow a Stripe-like invoice object into {@link ClassifyFailedInvoiceInput}
 * so webhook handlers never assign `Stripe.Invoice` directly into the classifier.
 */
export function toClassifyFailedInvoiceInput(invoice: {
  readonly id?: string | null;
  readonly billing_reason?: string | null;
  readonly attempt_count?: number | null;
  readonly next_payment_attempt?: number | null;
  readonly amount_due?: number | null;
  readonly hosted_invoice_url?: string | null;
  readonly customer?: unknown;
  readonly subscription?: unknown;
  readonly lines?: { data?: ReadonlyArray<unknown> } | null;
}): ClassifyFailedInvoiceInput {
  return {
    id: invoice.id,
    billing_reason: invoice.billing_reason,
    attempt_count: invoice.attempt_count,
    next_payment_attempt: invoice.next_payment_attempt,
    amount_due: invoice.amount_due,
    hosted_invoice_url: invoice.hosted_invoice_url,
    customer: idFromStripeRef(invoice.customer as string | { id?: string } | null),
    subscription: idFromStripeRef(invoice.subscription as string | { id?: string } | null),
    lines: invoice.lines ? { data: invoice.lines.data } : null,
  };
}

/**
 * Map a failed (or inspected) invoice into a dunning/proration signal.
 * `exhausted` when Stripe will not retry (`next_payment_attempt` null after ≥1 attempt).
 */
export const classifyFailedInvoiceEffect = (
  invoice: ClassifyFailedInvoiceInput
): Effect.Effect<InvoiceDunningSignal> =>
  Effect.sync(() => {
    const billingReason = normalizeBillingReason(invoice.billing_reason);
    const lineProration = Boolean(invoice.lines?.data?.some(lineLooksProrated));
    const isProration = billingReason === "subscription_update" || lineProration;
    const attemptCount =
      typeof invoice.attempt_count === "number" && invoice.attempt_count >= 0
        ? invoice.attempt_count
        : 0;
    const next =
      typeof invoice.next_payment_attempt === "number" ? invoice.next_payment_attempt : null;
    let stage: DunningStage;
    if (attemptCount <= 1 && next != null) stage = "first_failure";
    else if (next != null) stage = "retrying";
    else stage = "exhausted";

    return {
      billingReason,
      isProration,
      stage,
      attemptCount,
      nextPaymentAttemptUnix: next,
      invoiceId: invoice.id?.trim() || "unknown",
      subscriptionId: idFromStripeRef(invoice.subscription),
      customerId: idFromStripeRef(invoice.customer),
      amountDueUsd: (invoice.amount_due ?? 0) / 100,
      hostedInvoiceUrl: invoice.hosted_invoice_url?.trim() || null,
    };
  });

export type ClassifySubscriptionStatusInput = {
  readonly id?: string | null;
  readonly status?: string | null;
  readonly customer?: string | { id?: string } | null;
};

/** Map subscription.status into a dunning stage when relevant; null when no ops signal. */
export const classifySubscriptionStatusEffect = (
  sub: ClassifySubscriptionStatusInput
): Effect.Effect<SubscriptionDunningSignal | null> =>
  Effect.sync(() => {
    const status = (sub.status ?? "").trim().toLowerCase();
    let stage: DunningStage | null = null;
    if (status === "past_due") stage = "past_due";
    else if (status === "unpaid") stage = "unpaid";
    else if (status === "canceled" || status === "cancelled") stage = "canceled";
    else if (status === "active" || status === "trialing") stage = "recovered";
    if (!stage || stage === "recovered") {
      // Only emit recovered when callers pass prior past_due context; default skip active noise.
      if (stage === "recovered") return null;
      return null;
    }
    return {
      stage,
      subscriptionId: sub.id?.trim() || "unknown",
      customerId: idFromStripeRef(sub.customer),
      status,
    };
  });

/**
 * When subscription moves into past_due / unpaid / canceled — always emit.
 * When it returns to active after a known prior bad status — emit recovered.
 */
export const classifySubscriptionTransitionEffect = (input: {
  readonly previousStatus?: string | null;
  readonly subscription: ClassifySubscriptionStatusInput;
}): Effect.Effect<SubscriptionDunningSignal | null> =>
  Effect.sync(() => {
    const status = (input.subscription.status ?? "").trim().toLowerCase();
    const prev = (input.previousStatus ?? "").trim().toLowerCase();
    const bad = new Set(["past_due", "unpaid", "canceled", "cancelled", "incomplete_expired"]);
    if (status === "past_due" || status === "unpaid") {
      return {
        stage: status === "past_due" ? ("past_due" as const) : ("unpaid" as const),
        subscriptionId: input.subscription.id?.trim() || "unknown",
        customerId: idFromStripeRef(input.subscription.customer),
        status,
      };
    }
    if (status === "canceled" || status === "cancelled") {
      return {
        stage: "canceled" as const,
        subscriptionId: input.subscription.id?.trim() || "unknown",
        customerId: idFromStripeRef(input.subscription.customer),
        status,
      };
    }
    if ((status === "active" || status === "trialing") && bad.has(prev)) {
      return {
        stage: "recovered" as const,
        subscriptionId: input.subscription.id?.trim() || "unknown",
        customerId: idFromStripeRef(input.subscription.customer),
        status,
      };
    }
    return null;
  });

export const CLAWQL_STRIPE_DUNNING_TAG = "clawql/StripeDunning" as const;

export class StripeDunningService extends Context.Service<
  typeof CLAWQL_STRIPE_DUNNING_TAG,
  {
    readonly classifyFailedInvoice: (
      invoice: ClassifyFailedInvoiceInput
    ) => Effect.Effect<InvoiceDunningSignal>;
    readonly classifySubscriptionTransition: (input: {
      readonly previousStatus?: string | null;
      readonly subscription: ClassifySubscriptionStatusInput;
    }) => Effect.Effect<SubscriptionDunningSignal | null>;
  }
>()(CLAWQL_STRIPE_DUNNING_TAG) {}

export const StripeDunningLive = Layer.succeed(StripeDunningService, {
  classifyFailedInvoice: classifyFailedInvoiceEffect,
  classifySubscriptionTransition: classifySubscriptionTransitionEffect,
});
