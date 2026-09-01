/**
 * MCP OAuth access-token signing material — HS256 (dev) or RS256 (production).
 * Resource servers verify issued tokens via JWKS without holding the signing secret.
 */

import { readFileSync } from "node:fs";
import { createPublicKey } from "node:crypto";
import { Data, Effect } from "effect";
import { exportJWK, importPKCS8, importSPKI, type JWK } from "jose";

type McpOAuthSigningKey = CryptoKey | Uint8Array;

export type McpOAuthSigningAlg = "HS256" | "RS256";

export type McpOAuthSigningMaterial = {
  algorithm: McpOAuthSigningAlg;
  signKey: McpOAuthSigningKey;
  verifyKey: McpOAuthSigningKey;
  /** Empty for HS256; RS256 publishes verifying keys only. */
  jwks: { keys: JWK[] };
  /** Optional `kid` for RS256 token headers. */
  keyId?: string;
};

export class McpOAuthSigningError extends Data.TaggedError("McpOAuthSigningError")<{
  readonly reason: string;
  readonly cause?: unknown;
}> {}

function readPem(path: string | undefined, inline: string | undefined): string | undefined {
  if (inline?.trim()) return inline.trim();
  if (path?.trim()) return readFileSync(path.trim(), "utf8");
  return undefined;
}

function hs256Material(secret: string | Uint8Array): McpOAuthSigningMaterial {
  const key = typeof secret === "string" ? new TextEncoder().encode(secret) : secret;
  return {
    algorithm: "HS256",
    signKey: key,
    verifyKey: key,
    jwks: { keys: [] },
  };
}

export function loadMcpOAuthSigningMaterialEffect(input: {
  signingSecret?: string | Uint8Array;
  privateKeyPem?: string;
  privateKeyPemPath?: string;
  publicKeyPem?: string;
  publicKeyPemPath?: string;
  keyId?: string;
}): Effect.Effect<McpOAuthSigningMaterial, McpOAuthSigningError> {
  const privatePem = readPem(input.privateKeyPemPath, input.privateKeyPem);
  const publicPem = readPem(input.publicKeyPemPath, input.publicKeyPem);

  if (privatePem) {
    return Effect.gen(function* () {
      const privateKey = yield* Effect.tryPromise({
        try: () => importPKCS8(privatePem, "RS256"),
        catch: (cause) => new McpOAuthSigningError({ reason: "invalid_rs256_private_key", cause }),
      });

      let verifyKey: McpOAuthSigningKey;
      let jwkSource: McpOAuthSigningKey;
      if (publicPem) {
        verifyKey = yield* Effect.tryPromise({
          try: () => importSPKI(publicPem, "RS256"),
          catch: (cause) => new McpOAuthSigningError({ reason: "invalid_rs256_public_key", cause }),
        });
        jwkSource = verifyKey;
      } else {
        const derivedPublicPem = createPublicKey(privatePem).export({
          type: "spki",
          format: "pem",
        }) as string;
        verifyKey = yield* Effect.tryPromise({
          try: () => importSPKI(derivedPublicPem, "RS256"),
          catch: (cause) =>
            new McpOAuthSigningError({ reason: "derived_rs256_public_key_failed", cause }),
        });
        jwkSource = verifyKey;
      }

      const jwk = yield* Effect.tryPromise({
        try: () => exportJWK(jwkSource),
        catch: (cause) => new McpOAuthSigningError({ reason: "jwks_export_failed", cause }),
      });
      const keyId = input.keyId?.trim() || "clawql-mcp-oauth-rs256";
      const publicJwk: JWK = { ...jwk, alg: "RS256", use: "sig", kid: keyId };

      return {
        algorithm: "RS256" as const,
        signKey: privateKey,
        verifyKey,
        jwks: { keys: [publicJwk] },
        keyId,
      };
    });
  }

  if (input.signingSecret) {
    return Effect.succeed(hs256Material(input.signingSecret));
  }

  return Effect.fail(
    new McpOAuthSigningError({
      reason: "missing_signing_material",
    })
  );
}

export function mcpOAuthSigningConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(
    env.CLAWQL_MCP_OAUTH_SIGNING_SECRET?.trim() ||
    env.CLAWQL_MCP_OAUTH_SIGNING_PRIVATE_KEY_PEM?.trim() ||
    env.CLAWQL_MCP_OAUTH_SIGNING_PRIVATE_KEY_PEM_PATH?.trim()
  );
}

export function loadMcpOAuthSigningFromEnvEffect(
  env: NodeJS.ProcessEnv = process.env
): Effect.Effect<McpOAuthSigningMaterial, McpOAuthSigningError> {
  return loadMcpOAuthSigningMaterialEffect({
    signingSecret: env.CLAWQL_MCP_OAUTH_SIGNING_SECRET?.trim(),
    privateKeyPem: env.CLAWQL_MCP_OAUTH_SIGNING_PRIVATE_KEY_PEM?.trim(),
    privateKeyPemPath: env.CLAWQL_MCP_OAUTH_SIGNING_PRIVATE_KEY_PEM_PATH?.trim(),
    publicKeyPem: env.CLAWQL_MCP_OAUTH_SIGNING_PUBLIC_KEY_PEM?.trim(),
    publicKeyPemPath: env.CLAWQL_MCP_OAUTH_SIGNING_PUBLIC_KEY_PEM_PATH?.trim(),
    keyId: env.CLAWQL_MCP_OAUTH_SIGNING_KEY_ID?.trim(),
  });
}
