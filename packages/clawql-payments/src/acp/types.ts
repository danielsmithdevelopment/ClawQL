/** ACP checkout session types (OpenAI/Stripe Agentic Checkout subset). */

export type AcpMoney = {
  currency: string;
  /** Minor units. */
  amount: number;
};

export type AcpLineItem = {
  id: string;
  name: string;
  quantity: number;
  unit_amount: AcpMoney;
  total_amount: AcpMoney;
};

export type AcpBuyer = {
  name?: string;
  email?: string;
  phone?: string;
};

export type AcpPaymentData = {
  token: string;
  provider: "stripe" | "adyen" | "braintree" | "paypal";
};

export type AcpCheckoutStatus =
  "not_ready_for_payment" | "ready_for_payment" | "completed" | "canceled";

export type AcpCheckoutSession = {
  id: string;
  status: AcpCheckoutStatus;
  currency: string;
  line_items: AcpLineItem[];
  totals: {
    subtotal: AcpMoney;
    tax?: AcpMoney;
    total: AcpMoney;
  };
  buyer?: AcpBuyer;
  payment_provider?: "stripe";
  order?: {
    id: string;
    checkout_session_id: string;
    permalink_url?: string;
  };
  payment_intent_id?: string;
  created_at: string;
  updated_at: string;
};

export type CreateAcpCheckoutInput = {
  line_items: Array<{
    id?: string;
    name: string;
    quantity: number;
    /** Major units (e.g. 9.99). Converted to minor USD cents. */
    unit_amount: number;
    currency?: string;
  }>;
  buyer?: AcpBuyer;
  currency?: string;
};

export type CompleteAcpCheckoutInput = {
  checkout_session_id: string;
  buyer?: AcpBuyer;
  payment_data: AcpPaymentData;
};
