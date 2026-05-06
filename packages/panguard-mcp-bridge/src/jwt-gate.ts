/**
 * Optional JWT verification + ATR-shaped claim presence for the Panguard MCP bridge
 * (HTTP Streamable MCP + gRPC). Off unless {@link isBridgeJwtGateEnabled}.
 */

import { readFileSync } from "node:fs";
import {
  createRemoteJWKSet,
  importSPKI,
  jwtVerify,
  type JWTVerifyGetKey,
  type JWTPayload,
} from "jose";
import * as grpc from "@grpc/grpc-js";
import type { NextFunction, Request, RequestHandler, Response } from "express";

const HEALTH_PREFIX = "/grpc.health.";

function envFlag(name: string): boolean {
  const v = process.env[name]?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/** When true, {@link CLAWQL_MCP_JWT_ENABLED} requires a valid Bearer JWT on MCP HTTP and gRPC (except health). */
export function isBridgeJwtGateEnabled(): boolean {
  return envFlag("CLAWQL_MCP_JWT_ENABLED");
}

function atrClaimName(): string {
  return process.env.CLAWQL_MCP_JWT_ATR_CLAIM?.trim() || "atr";
}

function assertAtrClaim(payload: JWTPayload, claim: string): void {
  const v = payload[claim];
  if (v === undefined || v === null) {
    throw new Error(`Missing JWT claim "${claim}" (ATR binding)`);
  }
  if (typeof v === "object") {
    return;
  }
  throw new Error(`JWT claim "${claim}" must be a JSON object or array`);
}

let cachedJwks: JWTVerifyGetKey | undefined;
let cachedHs256Secret: Uint8Array | undefined;
let spkiImportPromise: Promise<CryptoKey> | undefined;
let spkiPemPath: string | undefined;

function resolveVerifyKey(): JWTVerifyGetKey {
  const hs = process.env.CLAWQL_MCP_JWT_HS256_SECRET?.trim();
  if (hs) {
    if (!cachedHs256Secret) {
      cachedHs256Secret = new TextEncoder().encode(hs);
    }
    return async () => cachedHs256Secret!;
  }

  const jwksUrl = process.env.CLAWQL_MCP_JWT_JWKS_URL?.trim();
  if (jwksUrl) {
    if (!cachedJwks) {
      cachedJwks = createRemoteJWKSet(new URL(jwksUrl));
    }
    return cachedJwks;
  }

  const pemPath = process.env.CLAWQL_MCP_JWT_PUBLIC_KEY_PEM_PATH?.trim();
  if (pemPath) {
    return async () => {
      if (spkiPemPath !== pemPath) {
        spkiPemPath = pemPath;
        spkiImportPromise = undefined;
      }
      if (!spkiImportPromise) {
        const pem = readFileSync(pemPath, "utf8");
        spkiImportPromise = importSPKI(pem, "RS256");
      }
      return spkiImportPromise;
    };
  }

  throw new Error(
    "CLAWQL_MCP_JWT_ENABLED requires one of: CLAWQL_MCP_JWT_JWKS_URL, CLAWQL_MCP_JWT_PUBLIC_KEY_PEM_PATH, or CLAWQL_MCP_JWT_HS256_SECRET (tests/dev only)"
  );
}

function verifyOptions(): {
  issuer?: string;
  audience?: string | string[];
} {
  const issuer = process.env.CLAWQL_MCP_JWT_ISSUER?.trim();
  const audRaw = process.env.CLAWQL_MCP_JWT_AUDIENCE?.trim();
  const audience = audRaw
    ? audRaw.includes(",")
      ? audRaw
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : audRaw
    : undefined;
  return {
    ...(issuer ? { issuer } : {}),
    ...(audience ? { audience } : {}),
  };
}

/** Validates `Authorization` value (full header or bare token); throws on failure. */
export async function verifyBridgeJwtAuthorizationHeader(authHeader: string): Promise<void> {
  const raw = authHeader.trim();
  const token = /^Bearer\s+(\S+)/i.exec(raw)?.[1] ?? (raw && !raw.includes(" ") ? raw : undefined);
  if (!token) {
    throw new Error("Missing Bearer token in Authorization");
  }
  const key = resolveVerifyKey();
  const { payload } = await jwtVerify(token, key, verifyOptions());
  assertAtrClaim(payload, atrClaimName());
}

/**
 * Express middleware: 401 JSON-RPC error when JWT invalid. Skip when gate disabled.
 * Apply only on MCP routes (caller passes `mcpPath`).
 */
export function createBridgeJwtExpressMiddleware(): RequestHandler | null {
  if (!isBridgeJwtGateEnabled()) {
    return null;
  }
  // Fail fast on misconfiguration
  resolveVerifyKey();
  return (req: Request, res: Response, next: NextFunction) => {
    void (async () => {
      try {
        const auth = req.headers.authorization ?? "";
        await verifyBridgeJwtAuthorizationHeader(auth);
        next();
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Unauthorized";
        res.status(401).json({
          jsonrpc: "2.0",
          error: { code: -32001, message: `Unauthorized: ${message}` },
          id: null,
        });
      }
    })();
  };
}

/** gRPC server interceptor: checks `authorization` metadata (Bearer). Health RPCs are skipped. */
export function createBridgeJwtGrpcInterceptor(): grpc.ServerInterceptor | null {
  if (!isBridgeJwtGateEnabled()) {
    return null;
  }
  resolveVerifyKey();
  return (methodDescriptor, nextCall) => {
    const path = methodDescriptor.path ?? "";
    if (path.includes(HEALTH_PREFIX)) {
      return new grpc.ServerInterceptingCall(nextCall);
    }
    return new grpc.ServerInterceptingCall(nextCall, {
      start: (next) => {
        next({
          onReceiveMetadata: (metadata, nextMetadata) => {
            void (async () => {
              try {
                const vals = metadata.get("authorization");
                const first = vals[0];
                const auth = first
                  ? Buffer.isBuffer(first)
                    ? first.toString("utf8")
                    : String(first)
                  : "";
                await verifyBridgeJwtAuthorizationHeader(auth);
                nextMetadata(metadata);
              } catch (e: unknown) {
                const details = e instanceof Error ? e.message : "Unauthorized";
                nextCall.sendStatus({ code: grpc.status.UNAUTHENTICATED, details });
              }
            })();
          },
        });
      },
    });
  };
}
