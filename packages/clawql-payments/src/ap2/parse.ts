import { Ap2Error, decodeJwtPayload, verifyHs256Jwt } from "./jwt.js";
import {
  VCT_PAYMENT_CLOSED,
  VCT_PAYMENT_OPEN,
  type Ap2Amount,
  type Ap2PaymentMandate,
} from "./types.js";

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function parseAmount(raw: unknown): Ap2Amount | undefined {
  const obj = asRecord(raw);
  if (!obj) return undefined;
  const currency =
    typeof obj.currency === "string"
      ? obj.currency
      : typeof obj.currency_code === "string"
        ? obj.currency_code
        : undefined;
  const valueRaw = obj.value ?? obj.amount ?? obj.amount_minor;
  const value =
    typeof valueRaw === "number"
      ? valueRaw
      : typeof valueRaw === "string"
        ? Number.parseInt(valueRaw, 10)
        : NaN;
  if (!currency?.trim() || !Number.isFinite(value)) return undefined;
  return { currency: currency.trim().toUpperCase(), value: Math.round(value) };
}

function expiryFromClaims(claims: Record<string, unknown>): {
  exp?: number;
  expires_at?: string;
} {
  if (typeof claims.exp === "number" && Number.isFinite(claims.exp)) {
    return { exp: claims.exp, expires_at: new Date(claims.exp * 1000).toISOString() };
  }
  const nested = asRecord(claims.payment_mandate_contents);
  const ts = typeof nested?.timestamp === "string" ? nested.timestamp : undefined;
  const legacy =
    typeof claims.expires_at === "string"
      ? claims.expires_at
      : typeof claims.intent_expiry === "string"
        ? claims.intent_expiry
        : undefined;
  return { expires_at: legacy ?? ts };
}

/** Normalize JSON / JWT payment mandate presentations into {@link Ap2PaymentMandate}. */
export function parsePaymentMandate(
  input: string | Record<string, unknown>,
  options: { hmacSecret?: string; requireSignature?: boolean } = {}
): { mandate: Ap2PaymentMandate; signed: boolean } {
  let claims: Record<string, unknown>;
  let signed = false;

  if (typeof input === "string") {
    const trimmed = input.trim();
    if (trimmed.startsWith("{")) {
      claims = JSON.parse(trimmed) as Record<string, unknown>;
    } else if (options.hmacSecret) {
      const verified = verifyHs256Jwt(trimmed, options.hmacSecret);
      claims = verified.payload;
      signed = true;
    } else {
      claims = decodeJwtPayload(trimmed);
      signed = false;
    }
  } else {
    claims = input;
  }

  if (options.requireSignature && !signed) {
    throw new Ap2Error({
      reason: "AP2 Payment Mandate signature required (set CLAWQL_AP2_HMAC_SECRET)",
    });
  }

  const nested = asRecord(claims.payment_mandate_contents);
  const vct =
    typeof claims.vct === "string" ? claims.vct : nested ? VCT_PAYMENT_CLOSED : VCT_PAYMENT_CLOSED;

  if (vct !== VCT_PAYMENT_CLOSED && vct !== VCT_PAYMENT_OPEN && !nested) {
    // Accept sample-model PaymentMandate without vct when nested contents exist.
    if (!asRecord(claims.contents) && typeof claims.natural_language_description !== "string") {
      // still ok if payment_amount present
      if (!parseAmount(claims.payment_amount) && !nested) {
        throw new Ap2Error({ reason: `Unsupported AP2 vct: ${vct}` });
      }
    }
  }

  const totalFromNested = nested
    ? parseAmount(asRecord(nested.payment_details_total)?.amount) ||
      parseAmount(nested.payment_details_total)
    : undefined;

  const { exp, expires_at } = expiryFromClaims(claims);
  const mandate: Ap2PaymentMandate = {
    kind: "payment",
    vct,
    transaction_id:
      typeof claims.transaction_id === "string"
        ? claims.transaction_id
        : typeof nested?.payment_details_id === "string"
          ? nested.payment_details_id
          : undefined,
    payee: asRecord(claims.payee) as Ap2PaymentMandate["payee"],
    payment_amount: parseAmount(claims.payment_amount) ?? totalFromNested,
    payment_instrument: asRecord(claims.payment_instrument),
    payment_mandate_id:
      typeof nested?.payment_mandate_id === "string"
        ? nested.payment_mandate_id
        : typeof claims.payment_mandate_id === "string"
          ? claims.payment_mandate_id
          : undefined,
    merchant_agent:
      typeof nested?.merchant_agent === "string"
        ? nested.merchant_agent
        : typeof claims.merchant_agent === "string"
          ? claims.merchant_agent
          : undefined,
    iat: typeof claims.iat === "number" ? claims.iat : undefined,
    exp,
    expires_at,
    user_authorization:
      typeof claims.user_authorization === "string" ? claims.user_authorization : undefined,
    raw: claims,
  };

  return { mandate, signed };
}

export function assertMandateNotExpired(mandate: Ap2PaymentMandate, nowMs = Date.now()): void {
  if (typeof mandate.exp === "number") {
    if (mandate.exp * 1000 < nowMs) {
      throw new Ap2Error({ reason: "AP2 Payment Mandate expired (exp)" });
    }
    return;
  }
  if (mandate.expires_at) {
    const ms = Date.parse(mandate.expires_at);
    if (Number.isFinite(ms) && ms < nowMs) {
      throw new Ap2Error({ reason: "AP2 Payment Mandate expired (expires_at)" });
    }
  }
}

export function mandateCoversAmount(
  mandate: Ap2PaymentMandate,
  amountMajor: number,
  currency = "USD"
): boolean {
  if (!mandate.payment_amount) return true;
  const cur = currency.trim().toUpperCase();
  if (
    mandate.payment_amount.currency !== cur &&
    !(cur === "USDC" && mandate.payment_amount.currency === "USD")
  ) {
    return false;
  }
  const decimals = cur === "USD" || cur === "USDC" || cur === "EUR" ? 2 : 6;
  const needed = Math.round(amountMajor * 10 ** decimals);
  return mandate.payment_amount.value >= needed;
}

export function readAp2MandateHeader(
  headers: Record<string, string | string[] | undefined>
): string | undefined {
  const keys = ["x-ap2-payment-mandate", "ap2-payment-mandate", "x-ap2-mandate", "ap2-mandate"];
  for (const key of keys) {
    const raw = headers[key] ?? headers[key.toUpperCase()];
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}
