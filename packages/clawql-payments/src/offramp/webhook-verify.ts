/**
 * Signature verification for MoonPay (HMAC-SHA256 V2) and Transak (HS256 JWT).
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { Data } from "effect";

export class OffRampWebhookError extends Data.TaggedError("OffRampWebhookError")<{
  readonly reason: string;
  readonly cause?: unknown;
}> {}

function safeEqualHex(a: string, b: string): boolean {
  try {
    const ab = Buffer.from(a, "hex");
    const bb = Buffer.from(b, "hex");
    if (ab.length !== bb.length || ab.length === 0) return false;
    return timingSafeEqual(ab, bb);
  } catch {
    return false;
  }
}

function b64urlDecode(input: string): Buffer {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  return Buffer.from(padded + pad, "base64");
}

/**
 * Verify MoonPay `Moonpay-Signature-V2` header (`t=<unix>,s=<hex>`).
 * signed_payload = `${timestamp}.${rawBody}`
 */
export function verifyMoonpaySignatureV2(
  rawBody: string,
  signatureHeader: string,
  secret: string,
  options?: { maxSkewSec?: number; nowSec?: number }
): { ok: true; timestamp: number } | { ok: false; reason: string } {
  if (!secret.trim()) return { ok: false, reason: "MoonPay webhook secret missing" };
  if (!signatureHeader.trim()) return { ok: false, reason: "Moonpay-Signature-V2 missing" };

  let timestamp: string | undefined;
  let signature: string | undefined;
  for (const part of signatureHeader.split(",")) {
    const [k, v] = part.trim().split("=");
    if (k === "t") timestamp = v;
    if (k === "s") signature = v;
  }
  if (!timestamp || !signature) {
    return { ok: false, reason: "Moonpay-Signature-V2 must include t= and s=" };
  }
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return { ok: false, reason: "Invalid MoonPay signature timestamp" };

  const maxSkew = options?.maxSkewSec ?? 300;
  const now = options?.nowSec ?? Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > maxSkew) {
    return { ok: false, reason: `MoonPay webhook timestamp skew > ${maxSkew}s` };
  }

  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`, "utf8")
    .digest("hex");
  if (!safeEqualHex(expected, signature)) {
    return { ok: false, reason: "MoonPay signature mismatch" };
  }
  return { ok: true, timestamp: ts };
}

/** Sign MoonPay webhook body (tests). */
export function signMoonpayWebhookV2(
  rawBody: string,
  secret: string,
  timestampSec?: number
): string {
  const t = timestampSec ?? Math.floor(Date.now() / 1000);
  const s = createHmac("sha256", secret).update(`${t}.${rawBody}`, "utf8").digest("hex");
  return `t=${t},s=${s}`;
}

/**
 * Verify Transak webhook JWT (`data` field) with HS256 using partner access token.
 * Returns decoded payload object.
 */
export function verifyTransakWebhookJwt(
  dataJwt: string,
  accessToken: string
): { ok: true; payload: Record<string, unknown> } | { ok: false; reason: string } {
  if (!accessToken.trim()) return { ok: false, reason: "Transak access token missing" };
  const parts = dataJwt.split(".");
  if (parts.length !== 3) return { ok: false, reason: "Transak webhook data is not a JWT" };
  const [headerB64, payloadB64, sigB64] = parts as [string, string, string];
  try {
    const header = JSON.parse(b64urlDecode(headerB64).toString("utf8")) as { alg?: string };
    if (header.alg && header.alg !== "HS256") {
      return { ok: false, reason: `Unsupported Transak JWT alg: ${header.alg}` };
    }
    const signingInput = `${headerB64}.${payloadB64}`;
    const expected = createHmac("sha256", accessToken).update(signingInput).digest();
    const actual = b64urlDecode(sigB64);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
      return { ok: false, reason: "Transak JWT signature mismatch" };
    }
    const payload = JSON.parse(b64urlDecode(payloadB64).toString("utf8")) as Record<
      string,
      unknown
    >;
    return { ok: true, payload };
  } catch (cause) {
    return {
      ok: false,
      reason: cause instanceof Error ? cause.message : "Transak JWT verify failed",
    };
  }
}

/** Sign Transak-style HS256 JWT (tests). */
export function signTransakWebhookJwt(
  payload: Record<string, unknown>,
  accessToken: string
): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", accessToken).update(`${header}.${body}`).digest("base64url");
  return `${header}.${body}.${sig}`;
}
