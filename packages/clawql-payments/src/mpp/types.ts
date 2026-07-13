/** MPP (Machine Payments Protocol) discovery and runtime types. @see https://mpp.dev/advanced/discovery */

export const MPP_METHOD_X402 = "x402" as const;
export const MPP_METHOD_STRIPE = "stripe" as const;

export type MppPaymentIntent = "charge" | "session";

export type MppPaymentMethod = typeof MPP_METHOD_X402 | typeof MPP_METHOD_STRIPE | string;

/** Canonical MPP payment offer (OpenAPI `x-payment-info.offers[]`). */
export type MppPaymentOffer = {
  intent: MppPaymentIntent;
  method: MppPaymentMethod;
  amount: string | null;
  currency?: string;
  description?: string;
};

/** Multi-offer `x-payment-info` extension shape. */
export type MppPaymentInfo = {
  offers: MppPaymentOffer[];
};

export type MppServiceDocs = {
  homepage?: string;
  apiReference?: string;
  llms?: string;
};

export type MppServiceInfo = {
  categories?: string[];
  docs?: MppServiceDocs;
};

/** Runtime payment challenge advertised in HTTP 402 / MCP -32042. */
export type MppPaymentChallenge = {
  id: string;
  intent: MppPaymentIntent;
  method: MppPaymentMethod;
  amount: string | null;
  currency?: string;
  resource: string;
  description?: string;
  /** Protocol-specific payload (x402 PaymentRequired, stripe hints, …). */
  extensions?: Record<string, unknown>;
};

export const MPP_MCP_PAYMENT_REQUIRED_CODE = -32042;
export const MPP_MCP_VERIFICATION_FAILED_CODE = -32043;

export const MPP_CREDENTIAL_META_KEY = "org.paymentauth/credential";
export const MPP_PAYMENT_REQUIRED_META_KEY = "org.paymentauth/payment-required";
export const MPP_RECEIPT_META_KEY = "org.paymentauth/receipt";
