/**
 * Ramp Business Developer API adapter.
 *
 * Primary ClawQL use: **agent virtual / agent cards** (spend-controlled PANs).
 * Creator fiat off-ramp remains Stripe Connect (`PayoutService`); Ramp here is
 * corporate spend authority for agents — not consumer crypto off-ramp UX.
 */

import { Context, Effect, Layer } from "effect";
import { Data } from "effect";
import { PaymentAuditService } from "../plugin/payment-audit-service.js";
import {
  buildRampAgentCardIssuedEntry,
  buildRampFundCreatedEntry,
  buildRampVirtualCardIssuedEntry,
} from "../audit/events.js";
import {
  isRampDryRun,
  isRampEnabled,
  rampApiBase,
  rampClientId,
  rampClientSecret,
  rampOAuthScopes,
  rampVaultApiBase,
} from "./config.js";

export class RampError extends Data.TaggedError("RampError")<{
  readonly reason: string;
  readonly cause?: unknown;
}> {}

export type RampFundResult = {
  id: string;
  displayName: string;
  limitUsd: number;
  state?: string;
  dryRun: boolean;
  raw?: Record<string, unknown>;
};

export type RampCardResult = {
  id: string;
  fundId?: string;
  lastFour?: string;
  /** Present only when vault returns it — never written to WORM. */
  pan?: string;
  cvv?: string;
  expiration?: string;
  amountUsd?: number;
  agentScoped: boolean;
  dryRun: boolean;
};

/** Effect service for Ramp funds + virtual/agent cards. */
export class RampService extends Context.Tag("clawql/RampService")<
  RampService,
  {
    readonly createFund: (input: {
      displayName: string;
      limitUsd: number;
      interval?: "DAILY" | "WEEKLY" | "MONTHLY" | "TOTAL" | "ANNUAL";
      tenantId?: string;
      correlationId?: string;
    }) => Effect.Effect<RampFundResult, RampError>;
    readonly createVirtualCard: (input: {
      userId: string;
      displayName?: string;
      limitUsd: number;
      interval?: "DAILY" | "WEEKLY" | "MONTHLY" | "TOTAL" | "ANNUAL";
      tenantId?: string;
      agentId?: string;
      correlationId?: string;
    }) => Effect.Effect<RampCardResult, RampError>;
    /**
     * Agent-oriented card: TOTAL (or short-lived) limit, optional merchant lock.
     * Uses Vault API in live mode; dry-run returns redacted placeholders.
     */
    readonly issueAgentCard: (input: {
      userId: string;
      amountUsd: number;
      displayName?: string;
      allowedVendorIds?: string[];
      tenantId?: string;
      agentId?: string;
      correlationId?: string;
    }) => Effect.Effect<RampCardResult, RampError>;
  }
>() {}

type TokenCache = { token: string; expiresAt: number };

export function rampLiveLayer(
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = fetch
): Layer.Layer<RampService, never, PaymentAuditService> {
  return Layer.effect(
    RampService,
    Effect.gen(function* () {
      const audit = yield* PaymentAuditService;
      let cached: TokenCache | null = null;

      const getToken = () =>
        Effect.tryPromise({
          try: async () => {
            if (!isRampEnabled(env)) {
              throw new RampError({
                reason: "Ramp disabled — set CLAWQL_RAMP_ENABLED=1 and RAMP_CLIENT_ID/SECRET",
              });
            }
            if (isRampDryRun(env)) return "dry_run_token";
            if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;
            const clientId = rampClientId(env);
            const secret = rampClientSecret(env);
            if (!clientId || !secret) {
              throw new RampError({
                reason: "Ramp not configured — set RAMP_CLIENT_ID and RAMP_CLIENT_SECRET",
              });
            }
            const auth = Buffer.from(`${clientId}:${secret}`).toString("base64");
            const body = new URLSearchParams({
              grant_type: "client_credentials",
              scope: rampOAuthScopes(env),
            });
            const res = await fetchImpl(`${rampApiBase(env)}/developer/v1/token`, {
              method: "POST",
              headers: {
                Authorization: `Basic ${auth}`,
                "Content-Type": "application/x-www-form-urlencoded",
              },
              body,
            });
            if (!res.ok) {
              const text = await res.text();
              throw new RampError({
                reason: `Ramp OAuth failed (${res.status}): ${text.slice(0, 200)}`,
              });
            }
            const json = (await res.json()) as {
              access_token?: string;
              expires_in?: number;
            };
            if (!json.access_token) {
              throw new RampError({ reason: "Ramp OAuth missing access_token" });
            }
            cached = {
              token: json.access_token,
              expiresAt: Date.now() + (json.expires_in ?? 864_000) * 1000,
            };
            return cached.token;
          },
          catch: (cause) =>
            cause instanceof RampError
              ? cause
              : new RampError({
                  reason: cause instanceof Error ? cause.message : "Ramp OAuth failed",
                  cause,
                }),
        });

      const createFund = (input: {
        displayName: string;
        limitUsd: number;
        interval?: "DAILY" | "WEEKLY" | "MONTHLY" | "TOTAL" | "ANNUAL";
        tenantId?: string;
        correlationId?: string;
      }) =>
        Effect.gen(function* () {
          if (!isRampEnabled(env)) {
            return yield* Effect.fail(
              new RampError({
                reason: "Ramp disabled — set CLAWQL_RAMP_ENABLED=1",
              })
            );
          }
          if (!Number.isFinite(input.limitUsd) || input.limitUsd <= 0) {
            return yield* Effect.fail(new RampError({ reason: "limitUsd must be > 0" }));
          }
          const tenantId = input.tenantId?.trim() || "default";
          const displayName = input.displayName.trim() || "ClawQL agent fund";
          const interval = input.interval ?? "MONTHLY";
          const amountMinor = Math.round(input.limitUsd * 100);

          if (isRampDryRun(env)) {
            const id = `fund_dry_${Date.now().toString(36)}`;
            yield* audit
              .appendEntry(
                buildRampFundCreatedEntry({
                  tenantId,
                  fundId: id,
                  displayName,
                  limitUsd: input.limitUsd,
                  dryRun: true,
                  correlationId: input.correlationId,
                })
              )
              .pipe(Effect.catchAll(() => Effect.void));
            return {
              id,
              displayName,
              limitUsd: input.limitUsd,
              state: "ACTIVE",
              dryRun: true,
            } satisfies RampFundResult;
          }

          const token = yield* getToken();
          const res = yield* Effect.tryPromise({
            try: async () => {
              const response = await fetchImpl(`${rampApiBase(env)}/developer/v1/funds`, {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${token}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  display_name: displayName,
                  is_shareable: true,
                  permitted_spend_types: {
                    physical_card: false,
                    reimbursements: false,
                    virtual_card: true,
                  },
                  spending_restrictions: {
                    interval,
                    limit: { amount: amountMinor, currency_code: "USD" },
                  },
                }),
              });
              const text = await response.text();
              if (!response.ok) {
                throw new RampError({
                  reason: `Ramp create fund failed (${response.status}): ${text.slice(0, 200)}`,
                });
              }
              return JSON.parse(text) as Record<string, unknown>;
            },
            catch: (cause) =>
              cause instanceof RampError
                ? cause
                : new RampError({
                    reason: cause instanceof Error ? cause.message : "create fund failed",
                    cause,
                  }),
          });

          const id = String(res.id ?? "");
          yield* audit
            .appendEntry(
              buildRampFundCreatedEntry({
                tenantId,
                fundId: id,
                displayName,
                limitUsd: input.limitUsd,
                dryRun: false,
                correlationId: input.correlationId,
              })
            )
            .pipe(Effect.catchAll(() => Effect.void));
          return {
            id,
            displayName,
            limitUsd: input.limitUsd,
            state: typeof res.state === "string" ? res.state : undefined,
            dryRun: false,
            raw: res,
          } satisfies RampFundResult;
        });

      const vaultIssue = (input: {
        userId: string;
        displayName: string;
        limitUsd: number;
        interval: "DAILY" | "WEEKLY" | "MONTHLY" | "TOTAL" | "ANNUAL";
        allowedVendorIds?: string[];
        tenantId: string;
        agentId?: string;
        correlationId?: string;
        agentScoped: boolean;
      }) =>
        Effect.gen(function* () {
          const amountMinor = Math.round(input.limitUsd * 100);
          if (isRampDryRun(env)) {
            const id = `card_dry_${Date.now().toString(36)}`;
            const entry = input.agentScoped
              ? buildRampAgentCardIssuedEntry({
                  tenantId: input.tenantId,
                  cardId: id,
                  amountUsd: input.limitUsd,
                  lastFour: "4242",
                  dryRun: true,
                  correlationId: input.correlationId,
                  agentId: input.agentId,
                })
              : buildRampVirtualCardIssuedEntry({
                  tenantId: input.tenantId,
                  cardId: id,
                  lastFour: "4242",
                  dryRun: true,
                  correlationId: input.correlationId,
                  agentId: input.agentId,
                });
            yield* audit.appendEntry(entry).pipe(Effect.catchAll(() => Effect.void));
            return {
              id,
              fundId: `fund_dry_${id}`,
              lastFour: "4242",
              pan: undefined,
              cvv: undefined,
              expiration: "2030-01",
              amountUsd: input.limitUsd,
              agentScoped: input.agentScoped,
              dryRun: true,
            } satisfies RampCardResult;
          }

          const token = yield* getToken();
          const res = yield* Effect.tryPromise({
            try: async () => {
              const response = await fetchImpl(`${rampVaultApiBase(env)}/cards/vault`, {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${token}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  user_id: input.userId,
                  display_name: input.displayName,
                  spending_restrictions: {
                    interval: input.interval,
                    limit: { amount: amountMinor, currency_code: "USD" },
                    ...(input.allowedVendorIds?.length
                      ? { allowed_vendors: input.allowedVendorIds }
                      : {}),
                  },
                }),
              });
              const text = await response.text();
              if (!response.ok) {
                throw new RampError({
                  reason: `Ramp vault card failed (${response.status}): ${text.slice(0, 200)}`,
                });
              }
              return JSON.parse(text) as Record<string, unknown>;
            },
            catch: (cause) =>
              cause instanceof RampError
                ? cause
                : new RampError({
                    reason: cause instanceof Error ? cause.message : "vault card failed",
                    cause,
                  }),
          });

          const id = String(res.id ?? res.card_id ?? "");
          const pan = typeof res.pan === "string" ? res.pan : undefined;
          const lastFour = pan ? pan.slice(-4) : undefined;
          const fundId =
            typeof res.spend_limit_id === "string"
              ? res.spend_limit_id
              : typeof res.fund_id === "string"
                ? res.fund_id
                : undefined;

          const entry = input.agentScoped
            ? buildRampAgentCardIssuedEntry({
                tenantId: input.tenantId,
                cardId: id,
                fundId,
                amountUsd: input.limitUsd,
                lastFour,
                dryRun: false,
                correlationId: input.correlationId,
                agentId: input.agentId,
              })
            : buildRampVirtualCardIssuedEntry({
                tenantId: input.tenantId,
                cardId: id,
                fundId,
                lastFour,
                dryRun: false,
                correlationId: input.correlationId,
                agentId: input.agentId,
              });
          yield* audit.appendEntry(entry).pipe(Effect.catchAll(() => Effect.void));

          return {
            id,
            fundId,
            lastFour,
            pan,
            cvv: typeof res.cvv === "string" ? res.cvv : undefined,
            expiration: typeof res.expiration === "string" ? res.expiration : undefined,
            amountUsd: input.limitUsd,
            agentScoped: input.agentScoped,
            dryRun: false,
          } satisfies RampCardResult;
        });

      const createVirtualCard = (input: {
        userId: string;
        displayName?: string;
        limitUsd: number;
        interval?: "DAILY" | "WEEKLY" | "MONTHLY" | "TOTAL" | "ANNUAL";
        tenantId?: string;
        agentId?: string;
        correlationId?: string;
      }) =>
        Effect.gen(function* () {
          if (!isRampEnabled(env)) {
            return yield* Effect.fail(
              new RampError({ reason: "Ramp disabled — set CLAWQL_RAMP_ENABLED=1" })
            );
          }
          if (!input.userId.trim()) {
            return yield* Effect.fail(new RampError({ reason: "userId required" }));
          }
          if (!Number.isFinite(input.limitUsd) || input.limitUsd <= 0) {
            return yield* Effect.fail(new RampError({ reason: "limitUsd must be > 0" }));
          }
          return yield* vaultIssue({
            userId: input.userId.trim(),
            displayName: input.displayName?.trim() || "ClawQL virtual card",
            limitUsd: input.limitUsd,
            interval: input.interval ?? "MONTHLY",
            tenantId: input.tenantId?.trim() || "default",
            agentId: input.agentId,
            correlationId: input.correlationId,
            agentScoped: false,
          });
        });

      const issueAgentCard = (input: {
        userId: string;
        amountUsd: number;
        displayName?: string;
        allowedVendorIds?: string[];
        tenantId?: string;
        agentId?: string;
        correlationId?: string;
      }) =>
        Effect.gen(function* () {
          if (!isRampEnabled(env)) {
            return yield* Effect.fail(
              new RampError({ reason: "Ramp disabled — set CLAWQL_RAMP_ENABLED=1" })
            );
          }
          if (!input.userId.trim()) {
            return yield* Effect.fail(new RampError({ reason: "userId required" }));
          }
          if (!Number.isFinite(input.amountUsd) || input.amountUsd <= 0) {
            return yield* Effect.fail(new RampError({ reason: "amountUsd must be > 0" }));
          }
          return yield* vaultIssue({
            userId: input.userId.trim(),
            displayName: input.displayName?.trim() || `ClawQL agent ${input.agentId ?? "card"}`,
            limitUsd: input.amountUsd,
            interval: "TOTAL",
            allowedVendorIds: input.allowedVendorIds,
            tenantId: input.tenantId?.trim() || "default",
            agentId: input.agentId?.trim() || input.userId.trim(),
            correlationId: input.correlationId,
            agentScoped: true,
          });
        });

      return RampService.of({
        createFund,
        createVirtualCard,
        issueAgentCard,
      });
    })
  );
}
