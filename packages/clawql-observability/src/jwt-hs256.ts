/** Shared HS256 JWT helpers for telemetry token mint (Node) and Faro Worker verify. */
export interface TelemetryJwtClaims {
  readonly sub: string;
  readonly project: string;
  readonly origin: string;
  readonly iat: number;
  readonly exp: number;
}

const b64urlToBytes = (input: string): Uint8Array => {
  const pad = "=".repeat((4 - (input.length % 4)) % 4);
  const b64 = (input + pad).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
};

const bytesToB64url = (bytes: ArrayBuffer | Uint8Array): string => {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (const b of arr) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

const importHmacKey = (secret: string, usages: readonly KeyUsage[]): Promise<CryptoKey> =>
  crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    usages
  );

export const verifyTelemetryJwt = async (
  token: string,
  secret: string
): Promise<TelemetryJwtClaims | null> => {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [headerB64, payloadB64, sigB64] = parts as [string, string, string];

  let header: { alg?: string; typ?: string };
  try {
    header = JSON.parse(new TextDecoder().decode(b64urlToBytes(headerB64)));
  } catch {
    return null;
  }
  if (header.alg !== "HS256") return null;

  const key = await importHmacKey(secret, ["verify"]);
  const data = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const sig = new Uint8Array(b64urlToBytes(sigB64));
  const valid = await crypto.subtle.verify("HMAC", key, sig, data);
  if (!valid) return null;

  let claims: TelemetryJwtClaims;
  try {
    claims = JSON.parse(new TextDecoder().decode(b64urlToBytes(payloadB64)));
  } catch {
    return null;
  }

  const now = Math.floor(Date.now() / 1000);
  if (!claims.exp || claims.exp < now) return null;
  if (!claims.sub || !claims.project || !claims.origin) return null;
  return claims;
};

export const signTelemetryJwtRaw = async (
  claims: TelemetryJwtClaims,
  secret: string
): Promise<string> => {
  const header = bytesToB64url(new TextEncoder().encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const payload = bytesToB64url(new TextEncoder().encode(JSON.stringify(claims)));
  const key = await importHmacKey(secret, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${header}.${payload}`));
  return `${header}.${payload}.${bytesToB64url(sig)}`;
};
