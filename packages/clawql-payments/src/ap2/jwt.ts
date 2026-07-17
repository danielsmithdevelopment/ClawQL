import { createHmac, timingSafeEqual } from "node:crypto";
import { Data } from "effect";

export class Ap2Error extends Data.TaggedError("Ap2Error")<{
  readonly reason: string;
  readonly cause?: unknown;
}> {
  /** Vitest/`Error.message` consumers — Effect TaggedError does not set `message` by default. */
  get message(): string {
    return this.reason;
  }
}

function b64urlToBuffer(input: string): Buffer {
  const pad = input.length % 4 === 0 ? "" : "=".repeat(4 - (input.length % 4));
  const b64 = input.replace(/-/g, "+").replace(/_/g, "/") + pad;
  return Buffer.from(b64, "base64");
}

export function decodeJwtPayload(token: string): Record<string, unknown> {
  const parts = token.trim().split(".");
  if (parts.length < 2) {
    throw new Ap2Error({ reason: "AP2 token must be a JWT with at least two segments" });
  }
  if (parts.length >= 3) {
    try {
      const header = JSON.parse(b64urlToBuffer(parts[0]!).toString("utf8")) as Record<
        string,
        unknown
      >;
      const alg = typeof header.alg === "string" ? header.alg.toLowerCase() : "";
      if (alg === "none" || alg === "") {
        throw new Ap2Error({ reason: `Unsupported JWT alg: ${String(header.alg)}` });
      }
    } catch (cause) {
      if (cause instanceof Ap2Error) throw cause;
      throw new Ap2Error({ reason: "Invalid JWT header", cause });
    }
  }
  try {
    const json = b64urlToBuffer(parts[1]!).toString("utf8");
    const parsed = JSON.parse(json) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Ap2Error({ reason: "AP2 JWT payload must be a JSON object" });
    }
    return parsed as Record<string, unknown>;
  } catch (cause) {
    if (cause instanceof Ap2Error) throw cause;
    throw new Ap2Error({ reason: "Failed to decode AP2 JWT payload", cause });
  }
}

/** Verify HS256 JWT when `CLAWQL_AP2_HMAC_SECRET` is configured. */
export function verifyHs256Jwt(
  token: string,
  secret: string
): { header: Record<string, unknown>; payload: Record<string, unknown> } {
  const parts = token.trim().split(".");
  if (parts.length !== 3) {
    throw new Ap2Error({ reason: "HS256 JWT requires three segments" });
  }
  const [h, p, s] = parts as [string, string, string];
  let header: Record<string, unknown>;
  try {
    header = JSON.parse(b64urlToBuffer(h).toString("utf8")) as Record<string, unknown>;
  } catch (cause) {
    throw new Ap2Error({ reason: "Invalid JWT header", cause });
  }
  if (header.alg !== "HS256") {
    throw new Ap2Error({ reason: `Unsupported JWT alg: ${String(header.alg)}` });
  }
  const expected = createHmac("sha256", secret).update(`${h}.${p}`).digest();
  const actual = b64urlToBuffer(s);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    throw new Ap2Error({ reason: "AP2 JWT signature mismatch" });
  }
  return { header, payload: decodeJwtPayload(token) };
}

export function signHs256Jwt(
  payload: Record<string, unknown>,
  secret: string,
  header: Record<string, unknown> = { alg: "HS256", typ: "JWT" }
): string {
  const enc = (obj: unknown) =>
    Buffer.from(JSON.stringify(obj), "utf8")
      .toString("base64")
      .replace(/=+$/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");
  const h = enc(header);
  const p = enc(payload);
  const sig = createHmac("sha256", secret)
    .update(`${h}.${p}`)
    .digest("base64")
    .replace(/=+$/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
  return `${h}.${p}.${sig}`;
}
