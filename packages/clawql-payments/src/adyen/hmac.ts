import { createHmac, timingSafeEqual } from "node:crypto";
import { Data } from "effect";

export class AdyenError extends Data.TaggedError("AdyenError")<{
  readonly reason: string;
  readonly cause?: unknown;
}> {}

/** Adyen standard webhook NotificationRequestItem (subset). */
export type AdyenNotificationRequestItem = {
  pspReference?: string;
  originalReference?: string;
  merchantAccountCode?: string;
  merchantReference?: string;
  amount?: { value?: number; currency?: string };
  eventCode?: string;
  success?: string;
  additionalData?: Record<string, string | undefined>;
  [key: string]: unknown;
};

/**
 * Payload string for HMAC-SHA256 per Adyen standard webhook docs:
 * pspReference:originalReference:merchantAccountCode:merchantReference:value:currency:eventCode:success
 */
export function adyenHmacPayload(item: AdyenNotificationRequestItem): string {
  const value =
    item.amount && typeof item.amount.value === "number" ? String(item.amount.value) : "";
  const currency = item.amount?.currency ?? "";
  return [
    item.pspReference ?? "",
    item.originalReference ?? "",
    item.merchantAccountCode ?? "",
    item.merchantReference ?? "",
    value,
    currency,
    item.eventCode ?? "",
    item.success ?? "",
  ].join(":");
}

/** Validate Adyen standard webhook HMAC (hex key → base64 HMAC-SHA256). */
export function verifyAdyenWebhookHmac(
  item: AdyenNotificationRequestItem,
  hmacKeyHex: string
): boolean {
  const provided =
    item.additionalData?.hmacSignature ??
    item.additionalData?.["hmacSignature"] ??
    (typeof item.additionalData?.hmacSignature === "string"
      ? item.additionalData.hmacSignature
      : undefined);
  if (!provided || typeof provided !== "string") return false;
  try {
    const key = Buffer.from(hmacKeyHex, "hex");
    const expected = createHmac("sha256", key).update(adyenHmacPayload(item), "utf8").digest();
    const actual = Buffer.from(provided, "base64");
    if (expected.length !== actual.length) return false;
    return timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

/** Sign a notification item (tests). */
export function signAdyenWebhookHmac(
  item: AdyenNotificationRequestItem,
  hmacKeyHex: string
): string {
  const key = Buffer.from(hmacKeyHex, "hex");
  return createHmac("sha256", key).update(adyenHmacPayload(item), "utf8").digest("base64");
}
