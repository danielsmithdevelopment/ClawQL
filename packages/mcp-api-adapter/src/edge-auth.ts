/**
 * Edge auth for mcp-api-adapter: static API key and/or ClawQL MCP JWTs via JWKS.
 *
 * Does not depend on clawql-auth — verifies Bearer JWTs with jose against a JWKS URL
 * (or HS256 secret for single-node / tests) and requires an `atr` claim.
 */

import {
  createRemoteJWKSet,
  jwtVerify,
  type JWTPayload,
  type JWTVerifyGetKey,
  type KeyLike,
} from "jose";

export type McpApiAdapterJwtAuthOptions = {
  /** ClawQL AS JWKS URL (e.g. `https://mcp.example.com/.well-known/jwks.json`). */
  jwksUrl?: string;
  /** Expected JWT `iss` (ClawQL MCP OAuth issuer). */
  issuer?: string;
  /** HS256 secret for tests / single-node when JWKS is unavailable. */
  hs256Secret?: string | Uint8Array;
};

export type McpApiAdapterEdgeAuthOptions = {
  apiKey?: string;
  jwt?: McpApiAdapterJwtAuthOptions;
};

export type VerifiedMcpAdapterAtr = {
  sub: string;
  role?: string;
  scope?: string[];
  orgId?: string;
};

function toKey(secret: string | Uint8Array): Uint8Array {
  return typeof secret === "string" ? new TextEncoder().encode(secret) : secret;
}

export function createJwtVerifier(
  options: McpApiAdapterJwtAuthOptions
): ((token: string) => Promise<VerifiedMcpAdapterAtr>) | null {
  const jwksUrl = options.jwksUrl?.trim();
  const issuer = options.issuer?.trim();
  const hs256 = options.hs256Secret;

  if (!jwksUrl && !hs256) return null;

  let jwks: JWTVerifyGetKey | undefined;
  if (jwksUrl) {
    jwks = createRemoteJWKSet(new URL(jwksUrl));
  }

  return async (token: string): Promise<VerifiedMcpAdapterAtr> => {
    let payload: JWTPayload;
    if (jwks) {
      const verified = await jwtVerify(token, jwks, {
        ...(issuer ? { issuer } : {}),
        algorithms: ["RS256", "ES256"],
      });
      payload = verified.payload;
    } else {
      const verified = await jwtVerify(token, toKey(hs256!), {
        ...(issuer ? { issuer } : {}),
        algorithms: ["HS256"],
      });
      payload = verified.payload;
    }

    const atr = payload.atr as VerifiedMcpAdapterAtr | undefined;
    if (!atr || typeof atr !== "object" || typeof atr.sub !== "string" || !atr.sub.trim()) {
      throw new Error("missing atr claim");
    }
    return atr;
  };
}

export function edgeAuthConfigured(options: McpApiAdapterEdgeAuthOptions): boolean {
  return Boolean(
    options.apiKey?.trim() ||
      options.jwt?.jwksUrl?.trim() ||
      options.jwt?.hs256Secret
  );
}

/**
 * Accept static API key (exact match) or a ClawQL-issued MCP Bearer JWT.
 * Returns true when the credential is valid.
 */
export async function verifyEdgeCredential(
  presented: string | undefined,
  options: McpApiAdapterEdgeAuthOptions,
  verifyJwt?: ((token: string) => Promise<VerifiedMcpAdapterAtr>) | null
): Promise<boolean> {
  if (!presented?.trim()) return false;
  const token = presented.trim();
  const apiKey = options.apiKey?.trim();
  if (apiKey && token === apiKey) return true;
  if (!verifyJwt) return false;
  try {
    await verifyJwt(token);
    return true;
  } catch {
    return false;
  }
}
