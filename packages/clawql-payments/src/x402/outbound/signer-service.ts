/**
 * X402Signer — SecretStore consumer (no second vault).
 * Dry-run mode for CI via CLAWQL_X402_OUTBOUND_SIGNER=dry-run.
 */

import { createHash } from "node:crypto";
import type { SecretStore } from "clawql-auth";
import { SecretStoreError } from "clawql-auth";
import { Context, Effect, Layer, Ref } from "effect";
import { X402Error } from "../../errors/payment-errors.js";
import type { OutboundX402QuoteTerms } from "./types.js";

export type X402SignRequest = {
  readonly tenantId: string;
  readonly agentId: string;
  readonly sessionId: string;
  readonly resourceUrl: string;
  readonly quote: OutboundX402QuoteTerms;
  readonly quoteDigest: string;
};

export type X402SignResult = {
  readonly paymentHeader: string;
  readonly payerAddress: string;
  readonly mode: "dry-run" | "secret-store";
};

const SECRET_PATH_PREFIX = "x402/outbound/signer";
const FREEZE_PREFIX = "x402/outbound/freeze";

function signerSecretPath(tenantId: string, agentId: string): string {
  return `${SECRET_PATH_PREFIX}/${tenantId}/${agentId}`;
}

function freezePath(sessionId: string, tenantId: string, agentId: string): string {
  return `${FREEZE_PREFIX}/${sessionId}/${tenantId}/${agentId}`;
}

export class X402SignerService extends Context.Tag("clawql/X402SignerService")<
  X402SignerService,
  {
    readonly sign: (
      req: X402SignRequest
    ) => Effect.Effect<X402SignResult, X402Error | SecretStoreError>;
    /** After settle_unconfirmed — freeze until operator reconciles. No retry-sign. */
    readonly freezeForSession: (
      sessionId: string,
      tenantId: string,
      agentId: string,
      reason: string
    ) => Effect.Effect<void, X402Error | SecretStoreError>;
    readonly isFrozen: (
      sessionId: string,
      tenantId: string,
      agentId: string
    ) => Effect.Effect<boolean, X402Error | SecretStoreError>;
  }
>() {}

export type X402SignerLayerOptions = {
  readonly secretStore?: SecretStore;
  readonly mode?: "dry-run" | "secret-store";
  readonly env?: NodeJS.ProcessEnv;
  /** Fixed payer address for dry-run / when secret has no address field. */
  readonly dryRunPayerAddress?: string;
};

function resolveMode(
  env: NodeJS.ProcessEnv,
  explicit?: "dry-run" | "secret-store"
): "dry-run" | "secret-store" {
  if (explicit) return explicit;
  const raw = env.CLAWQL_X402_OUTBOUND_SIGNER?.trim().toLowerCase();
  if (raw === "dry-run" || raw === "dryrun") return "dry-run";
  return "secret-store";
}

export function createX402SignerLayer(
  options: X402SignerLayerOptions = {}
): Layer.Layer<X402SignerService> {
  const env = options.env ?? process.env;
  const mode = resolveMode(env, options.mode);
  const dryRunPayer =
    options.dryRunPayerAddress?.trim() ||
    env.CLAWQL_X402_OUTBOUND_DRY_RUN_PAYER?.trim() ||
    "0xDryRunPayer00000000000000000000000001";

  return Layer.effect(
    X402SignerService,
    Effect.gen(function* () {
      // In-memory freeze overlay (also mirrored to SecretStore when available).
      const freezeMem = yield* Ref.make(new Set<string>());
      const store = options.secretStore;

      const checkFrozen = (sessionId: string, tenantId: string, agentId: string) =>
        Effect.gen(function* () {
          const key = freezePath(sessionId, tenantId, agentId);
          const mem = yield* Ref.get(freezeMem);
          if (mem.has(key)) return true;
          if (!store) return false;
          const v = yield* store.getSecret(key);
          return v !== null && v.length > 0;
        });

      return X402SignerService.of({
        isFrozen: checkFrozen,
        freezeForSession: (sessionId, tenantId, agentId, reason) =>
          Effect.gen(function* () {
            const key = freezePath(sessionId, tenantId, agentId);
            yield* Ref.update(freezeMem, (s) => {
              const copy = new Set(s);
              copy.add(key);
              return copy;
            });
            if (store) {
              yield* store.setSecret(
                key,
                JSON.stringify({ reason, frozenAt: new Date().toISOString() })
              );
            }
          }),
        sign: (req) =>
          Effect.gen(function* () {
            if (yield* checkFrozen(req.sessionId, req.tenantId, req.agentId)) {
              return yield* Effect.fail(
                new X402Error({ reason: "signer_frozen_after_settle_unconfirmed" })
              );
            }

            if (mode === "dry-run") {
              const payload = {
                x402Version: 2,
                mode: "dry-run",
                quoteDigest: req.quoteDigest,
                payTo: req.quote.payTo,
                amount: req.quote.amountAtomic,
                network: req.quote.network,
                asset: req.quote.asset,
                resource: req.resourceUrl,
                sig: createHash("sha256")
                  .update(`dry-run|${req.quoteDigest}|${req.resourceUrl}`)
                  .digest("hex"),
              };
              return {
                paymentHeader: Buffer.from(JSON.stringify(payload)).toString("base64"),
                payerAddress: dryRunPayer,
                mode: "dry-run" as const,
              };
            }

            if (!store) {
              return yield* Effect.fail(
                new X402Error({
                  reason: "secret_store_unavailable_for_x402_signer",
                })
              );
            }

            const path = signerSecretPath(req.tenantId, req.agentId);
            const secret = yield* store.getSecret(path);
            if (!secret?.trim()) {
              return yield* Effect.fail(new X402Error({ reason: `signer_secret_missing:${path}` }));
            }

            // Material stays in SecretStore; we only emit a deterministic opaque header
            // derived from digest + resource (real EIP-3009 signing is a later rail step).
            let payerAddress = dryRunPayer;
            try {
              const parsed = JSON.parse(secret) as { address?: string };
              if (parsed.address?.trim()) payerAddress = parsed.address.trim();
            } catch {
              // Opaque hex / raw secret — address from env override if set.
            }

            const payload = {
              x402Version: 2,
              mode: "secret-store",
              quoteDigest: req.quoteDigest,
              payTo: req.quote.payTo,
              amount: req.quote.amountAtomic,
              network: req.quote.network,
              asset: req.quote.asset,
              resource: req.resourceUrl,
              // Binding proof without exporting the secret: HMAC-like digest over secret+quote.
              sig: createHash("sha256")
                .update(`${secret}|${req.quoteDigest}|${req.resourceUrl}`)
                .digest("hex"),
            };

            return {
              paymentHeader: Buffer.from(JSON.stringify(payload)).toString("base64"),
              payerAddress,
              mode: "secret-store" as const,
            };
          }),
      });
    })
  );
}
