/**
 * AP2 mandate shapes aligned with google-agentic-commerce/AP2
 * (Python models + SD-JWT vct schemas). Soft subset for gateway auth.
 */

export const INTENT_MANDATE_DATA_KEY = "ap2.mandates.IntentMandate";
export const CART_MANDATE_DATA_KEY = "ap2.mandates.CartMandate";
export const PAYMENT_MANDATE_DATA_KEY = "ap2.mandates.PaymentMandate";

export const VCT_PAYMENT_CLOSED = "mandate.payment.1";
export const VCT_PAYMENT_OPEN = "mandate.payment.open.1";
export const VCT_CHECKOUT_CLOSED = "mandate.checkout.1";
export const VCT_CHECKOUT_OPEN = "mandate.checkout.open.1";

export type Ap2Amount = {
  currency: string;
  /** Integer minor units (ISO 4217), e.g. 199 = $1.99 USD. */
  value: number;
};

export type Ap2IntentMandate = {
  kind: "intent";
  user_cart_confirmation_required: boolean;
  natural_language_description: string;
  merchants?: string[];
  skus?: string[];
  requires_refundability?: boolean;
  intent_expiry: string;
  raw: Record<string, unknown>;
};

export type Ap2CartMandate = {
  kind: "cart";
  contents: {
    id: string;
    user_cart_confirmation_required: boolean;
    merchant_name: string;
    cart_expiry: string;
    payment_request?: Record<string, unknown>;
  };
  merchant_authorization?: string;
  raw: Record<string, unknown>;
};

/** Closed Payment Mandate claims (vct mandate.payment.1) + sample-model fields. */
export type Ap2PaymentMandate = {
  kind: "payment";
  vct: string;
  transaction_id?: string;
  payee?: { id?: string; name?: string; [k: string]: unknown };
  payment_amount?: Ap2Amount;
  payment_instrument?: Record<string, unknown>;
  payment_mandate_id?: string;
  merchant_agent?: string;
  iat?: number;
  exp?: number;
  /** ISO expiry from legacy sample model. */
  expires_at?: string;
  user_authorization?: string;
  raw: Record<string, unknown>;
};

export type Ap2Mandate = Ap2IntentMandate | Ap2CartMandate | Ap2PaymentMandate;

export type Ap2VerifyResult = {
  ok: true;
  mandate: Ap2PaymentMandate;
  signed: boolean;
  transactionId?: string;
};

export type Ap2AuthorizeInput = {
  mandate: Ap2PaymentMandate;
  resource: string;
  /** Gate price in major units when currency is USD/USDC. */
  amountMajor?: number;
  currency?: string;
  merchantId?: string;
};
