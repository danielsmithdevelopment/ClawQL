/**
 * Cloudflare Wallets adapter (prep / dry-run).
 *
 * Account Wallets (org) + Virtual Wallets (delegated agent spend with hard caps).
 * Handle identity: clawql.cloudflare.pay (reserved on cloudflare.pay).
 *
 * Live Virtual Wallet HTTP APIs are not public yet — this service implements the
 * Effect contract + local dry-run store so Ramp / compensation / discovery can
 * wire against a stable Tag. Swap the HTTP client when Cloudflare ships.
 */

import { Context, Effect, Layer } from "effect";
import { Data } from "effect";
import { PaymentAuditService } from "../plugin/payment-audit-service.js";
import {
  buildCloudflareHandleResolvedEntry,
  buildCloudflareVirtualWalletIssuedEntry,
  buildCloudflareVirtualWalletRevokedEntry,
} from "../audit/events.js";
import {
  cloudflarePayHandleUri,
  cloudflareWalletsApiBase,
  cloudflareWalletsHandle,
  isCloudflareWalletsDryRun,
  isCloudflareWalletsEnabled,
  normalizeCloudflarePayHandle,
} from "./config.js";
import {
  getVirtualWallet,
  listVirtualWallets,
  upsertVirtualWallet,
  type CloudflareVirtualWalletRecord,
} from "./store.js";

export class CloudflareWalletError extends Data.TaggedError("CloudflareWalletError")<{
  readonly reason: string;
  readonly cause?: unknown;
}> {}

export type CloudflareHandleIdentity = {
  handle: string;
  uri: string;
  category: "IDENTITY";
  scope: "ACCOUNT_AND_AGENT";
  reserved: boolean;
  oneOfOne: boolean;
  status: "reserved" | "unknown";
  dryRun: boolean;
};

export type CloudflareVirtualWalletResult = CloudflareVirtualWalletRecord & {
  remainingUsd: number;
};

/** Effect service for Cloudflare Wallets identity + Virtual Wallets. */
export class CloudflareWalletService extends Context.Tag("clawql/CloudflareWalletService")<
  CloudflareWalletService,
  {
    readonly resolveHandle: (input: {
      handle?: string;
      tenantId?: string;
      correlationId?: string;
    }) => Effect.Effect<CloudflareHandleIdentity, CloudflareWalletError>;
    readonly createVirtualWallet: (input: {
      agentId: string;
      allowanceUsd: number;
      maxTxUsd?: number;
      merchantAllowList?: string[];
      handle?: string;
      tenantId?: string;
      correlationId?: string;
    }) => Effect.Effect<CloudflareVirtualWalletResult, CloudflareWalletError>;
    readonly getSpendStatus: (input: {
      walletId: string;
    }) => Effect.Effect<CloudflareVirtualWalletResult, CloudflareWalletError>;
    readonly revokeVirtualWallet: (input: {
      walletId: string;
      tenantId?: string;
      correlationId?: string;
    }) => Effect.Effect<CloudflareVirtualWalletResult, CloudflareWalletError>;
    readonly listVirtualWallets: (input?: {
      agentId?: string;
    }) => Effect.Effect<CloudflareVirtualWalletResult[], CloudflareWalletError>;
  }
>() {}

function toResult(record: CloudflareVirtualWalletRecord): CloudflareVirtualWalletResult {
  const remaining = Math.max(0, record.allowanceUsd - record.spentUsd);
  return { ...record, remainingUsd: remaining };
}

export function cloudflareWalletLiveLayer(
  env: NodeJS.ProcessEnv = process.env
): Layer.Layer<CloudflareWalletService, never, PaymentAuditService> {
  return Layer.effect(
    CloudflareWalletService,
    Effect.gen(function* () {
      const audit = yield* PaymentAuditService;

      const resolveHandle = (input: {
        handle?: string;
        tenantId?: string;
        correlationId?: string;
      }): Effect.Effect<CloudflareHandleIdentity, CloudflareWalletError> =>
        Effect.gen(function* () {
          if (!isCloudflareWalletsEnabled(env)) {
            return yield* Effect.fail(
              new CloudflareWalletError({
                reason:
                  "Cloudflare Wallets disabled — set CLAWQL_CLOUDFLARE_WALLETS=1",
              })
            );
          }
          const configured = cloudflareWalletsHandle(env);
          const requested = normalizeCloudflarePayHandle(
            input.handle?.trim() || configured
          );
          const reserved = requested === configured;
          const dryRun = isCloudflareWalletsDryRun(env);
          const identity: CloudflareHandleIdentity = {
            handle: requested,
            uri: cloudflarePayHandleUri(requested),
            category: "IDENTITY",
            scope: "ACCOUNT_AND_AGENT",
            reserved,
            oneOfOne: reserved,
            status: reserved ? "reserved" : "unknown",
            dryRun,
          };

          yield* audit.append(
            buildCloudflareHandleResolvedEntry({
              tenantId: input.tenantId ?? "default",
              handle: identity.handle,
              reserved,
              dryRun,
              correlationId: input.correlationId,
            })
          ).pipe(
            Effect.mapError(
              (cause) =>
                new CloudflareWalletError({ reason: "audit append failed", cause })
            )
          );

          return identity;
        });

      const createVirtualWallet = (input: {
        agentId: string;
        allowanceUsd: number;
        maxTxUsd?: number;
        merchantAllowList?: string[];
        handle?: string;
        tenantId?: string;
        correlationId?: string;
      }): Effect.Effect<CloudflareVirtualWalletResult, CloudflareWalletError> =>
        Effect.gen(function* () {
          if (!isCloudflareWalletsEnabled(env)) {
            return yield* Effect.fail(
              new CloudflareWalletError({
                reason:
                  "Cloudflare Wallets disabled — set CLAWQL_CLOUDFLARE_WALLETS=1",
              })
            );
          }
          if (!input.agentId?.trim()) {
            return yield* Effect.fail(
              new CloudflareWalletError({ reason: "agentId is required" })
            );
          }
          if (!Number.isFinite(input.allowanceUsd) || input.allowanceUsd <= 0) {
            return yield* Effect.fail(
              new CloudflareWalletError({ reason: "allowanceUsd must be a positive number" })
            );
          }
          if (
            input.maxTxUsd !== undefined &&
            (!Number.isFinite(input.maxTxUsd) || input.maxTxUsd <= 0)
          ) {
            return yield* Effect.fail(
              new CloudflareWalletError({ reason: "maxTxUsd must be a positive number" })
            );
          }

          const dryRun = isCloudflareWalletsDryRun(env);
          const apiBase = cloudflareWalletsApiBase(env);
          if (!dryRun && apiBase) {
            return yield* Effect.fail(
              new CloudflareWalletError({
                reason:
                  "Live Cloudflare Virtual Wallet API not implemented yet — unset CLOUDFLARE_WALLETS_API_BASE or force CLAWQL_CLOUDFLARE_WALLETS_DRY_RUN=1",
              })
            );
          }

          const now = new Date().toISOString();
          const id = `cfw_dry_${Date.now().toString(36)}`;
          const handle = normalizeCloudflarePayHandle(
            input.handle?.trim() || cloudflareWalletsHandle(env)
          );
          const record: CloudflareVirtualWalletRecord = {
            id,
            handle,
            agentId: input.agentId.trim(),
            allowanceUsd: input.allowanceUsd,
            maxTxUsd: input.maxTxUsd,
            merchantAllowList: input.merchantAllowList ?? [],
            status: "active",
            tenantId: input.tenantId,
            credentialHint: `dry-run-key:${id}`,
            createdAt: now,
            updatedAt: now,
            spentUsd: 0,
            dryRun: true,
          };

          const saved = yield* Effect.tryPromise({
            try: () => upsertVirtualWallet(env, record),
            catch: (cause) =>
              new CloudflareWalletError({ reason: "failed to persist virtual wallet", cause }),
          });

          yield* audit.append(
            buildCloudflareVirtualWalletIssuedEntry({
              tenantId: input.tenantId ?? "default",
              walletId: saved.id,
              agentId: saved.agentId,
              allowanceUsd: saved.allowanceUsd,
              handle: saved.handle,
              dryRun: true,
              correlationId: input.correlationId,
            })
          ).pipe(
            Effect.mapError(
              (cause) =>
                new CloudflareWalletError({ reason: "audit append failed", cause })
            )
          );

          return toResult(saved);
        });

      const getSpendStatus = (input: {
        walletId: string;
      }): Effect.Effect<CloudflareVirtualWalletResult, CloudflareWalletError> =>
        Effect.gen(function* () {
          if (!isCloudflareWalletsEnabled(env)) {
            return yield* Effect.fail(
              new CloudflareWalletError({
                reason:
                  "Cloudflare Wallets disabled — set CLAWQL_CLOUDFLARE_WALLETS=1",
              })
            );
          }
          const record = yield* Effect.tryPromise({
            try: () => getVirtualWallet(env, input.walletId),
            catch: (cause) =>
              new CloudflareWalletError({ reason: "failed to load virtual wallet", cause }),
          });
          if (!record) {
            return yield* Effect.fail(
              new CloudflareWalletError({ reason: `wallet not found: ${input.walletId}` })
            );
          }
          return toResult(record);
        });

      const revokeVirtualWallet = (input: {
        walletId: string;
        tenantId?: string;
        correlationId?: string;
      }): Effect.Effect<CloudflareVirtualWalletResult, CloudflareWalletError> =>
        Effect.gen(function* () {
          if (!isCloudflareWalletsEnabled(env)) {
            return yield* Effect.fail(
              new CloudflareWalletError({
                reason:
                  "Cloudflare Wallets disabled — set CLAWQL_CLOUDFLARE_WALLETS=1",
              })
            );
          }
          const existing = yield* Effect.tryPromise({
            try: () => getVirtualWallet(env, input.walletId),
            catch: (cause) =>
              new CloudflareWalletError({ reason: "failed to load virtual wallet", cause }),
          });
          if (!existing) {
            return yield* Effect.fail(
              new CloudflareWalletError({ reason: `wallet not found: ${input.walletId}` })
            );
          }
          const now = new Date().toISOString();
          const revoked: CloudflareVirtualWalletRecord = {
            ...existing,
            status: "revoked",
            updatedAt: now,
            credentialHint: undefined,
          };
          const saved = yield* Effect.tryPromise({
            try: () => upsertVirtualWallet(env, revoked),
            catch: (cause) =>
              new CloudflareWalletError({ reason: "failed to revoke virtual wallet", cause }),
          });

          yield* audit.append(
            buildCloudflareVirtualWalletRevokedEntry({
              tenantId: input.tenantId ?? existing.tenantId ?? "default",
              walletId: saved.id,
              agentId: saved.agentId,
              dryRun: saved.dryRun,
              correlationId: input.correlationId,
            })
          ).pipe(
            Effect.mapError(
              (cause) =>
                new CloudflareWalletError({ reason: "audit append failed", cause })
            )
          );

          return toResult(saved);
        });

      const listWallets = (input?: {
        agentId?: string;
      }): Effect.Effect<CloudflareVirtualWalletResult[], CloudflareWalletError> =>
        Effect.gen(function* () {
          if (!isCloudflareWalletsEnabled(env)) {
            return yield* Effect.fail(
              new CloudflareWalletError({
                reason:
                  "Cloudflare Wallets disabled — set CLAWQL_CLOUDFLARE_WALLETS=1",
              })
            );
          }
          const rows = yield* Effect.tryPromise({
            try: () => listVirtualWallets(env, { agentId: input?.agentId }),
            catch: (cause) =>
              new CloudflareWalletError({ reason: "failed to list virtual wallets", cause }),
          });
          return rows.map(toResult);
        });

      return {
        resolveHandle,
        createVirtualWallet,
        getSpendStatus,
        revokeVirtualWallet,
        listVirtualWallets: listWallets,
      };
    })
  );
}
