export const X402_VERSION = 2 as const;

export type X402Scheme = "exact" | "upto";

export type X402PaymentRequirements = {
  scheme: X402Scheme;
  network: string;
  amount: string;
  asset: string;
  payTo: string;
  maxTimeoutSeconds?: number;
  extra?: Record<string, string>;
};

export type X402ResourceInfo = {
  url: string;
  description?: string;
  mimeType?: string;
};

export type X402PaymentPayloadV2 = {
  x402Version: number;
  resource?: X402ResourceInfo;
  accepted?: X402PaymentRequirements;
  payload?: Record<string, unknown>;
};

export type X402PaymentRequired = {
  x402Version: number;
  error?: string;
  resource: X402ResourceInfo;
  accepts: X402PaymentRequirements[];
  extensions?: Record<string, unknown>;
};

export type X402FacilitatorVerifyRequest = {
  x402Version: number;
  paymentPayload: X402PaymentPayloadV2;
  paymentRequirements: X402PaymentRequirements;
};

export type X402FacilitatorVerifyResponse = {
  isValid: boolean;
  payer?: string;
  invalidReason?: string;
};

export type X402FacilitatorSettleResponse = {
  success: boolean;
  transaction?: string;
  errorReason?: string;
};
