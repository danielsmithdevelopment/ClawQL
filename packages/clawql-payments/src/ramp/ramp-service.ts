/**
 * Ramp Business Developer API adapter.
 *
 * Primary ClawQL use: **agent virtual / agent cards** (spend-controlled PANs).
 * When `CLAWQL_RAMP_AGENTIC=1` (or scopes include `cards:read_agentic`), agent
 * cards use the native agentic Developer API path instead of Vault PCI.
 *
 * Creator fiat off-ramp remains Stripe Connect / Moonpay-Transak — Ramp here is
 * corporate spend authority for agents.
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
  isRampAgenticEnabled,
  isRampDryRun,
  isRampEnabled,
  rampAgenticCredsPath,
  rampAgenticIssuePath,
  rampAgenticReadPath,
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

export type RampCardIssuancePath = "vault" | "agentic";

export type RampCardResult = {
  id: string;
  fundId?: string;
  lastFour?: string;
  /** Present only when API returns it — never written to WORM. */
  pan?: string;
  cvv?: string;
  expiration?: string;
  amountUsd?: number;
  agentScoped: boolean;
  issuancePath: RampCardIssuancePath;
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
     * Agent-oriented card: TOTAL limit, optional merchant lock.
     * Uses native agentic API when enabled; otherwise Vault.
     */
    readonly issueAgentCard: (input: {
      userId: string;
      amountUsd: number;
      displayName?: string;
      allowedVendorIds?: string[];
      fundId?: string;
      merchantName?: string;
      merchantUrl?: string;
      merchantCountryCode?: string;
      rationale?: string;
      tenantId?: string;
      agentId?: string;
      correlationId?: string;
    }) => Effect.Effect<RampCardResult, RampError>;
    /** Read agentic card metadata (requires cards:read_agentic). */
    readonly readAgenticCard: (input: {
      cardId: string;
    }) => Effect.Effect<Record<string, unknown>, RampError>;
  }
>() {}

type TokenCache = { token: string; expiresAt: number };

function parseCardSecrets(res: Record<string, unknown>): {
  id: string;
  pan?: string;
  cvv?: string;
  expiration?: string;
  lastFour?: string;
  fundId?: string;
} {
  const id = String(res.id ?? res.card_id ?? "");
  const pan = typeof res.pan === "string" ? res.pan : undefined;
  const lastFour =
    pan?.slice(-4) ??
    (typeof res.last_four === "string" ? res.last_four : undefined) ??
    (typeof res.lastFour === "string" ? res.lastFour : undefined);
  const fundId =
    typeof res.spend_limit_id === "string"
      ? res.spend_limit_id
      : typeof res.fund_id === "string"
        ? res.fund_id
        : undefined;
  let expiration: string | undefined;
  if (typeof res.expiration === "string") expiration = res.expiration;
  else if (res.expiration_month != null && res.expiration_year != null) {
    const mm = String(res.expiration_month).padStart(2, "0");
    expiration = `${res.expiration_year}-${mm}`;
  }
  return {
    id,
    pan,
    cvv: typeof res.cvv === "string" ? res.cvv : undefined,
    expiration,
    lastFour,
    fundId,
  };
}

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
              issuancePath: "vault" as const,
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

          const parsed = parseCardSecrets(res);
          const entry = input.agentScoped
            ? buildRampAgentCardIssuedEntry({
                tenantId: input.tenantId,
                cardId: parsed.id,
                fundId: parsed.fundId,
                amountUsd: input.limitUsd,
                lastFour: parsed.lastFour,
                dryRun: false,
                correlationId: input.correlationId,
                agentId: input.agentId,
              })
            : buildRampVirtualCardIssuedEntry({
                tenantId: input.tenantId,
                cardId: parsed.id,
                fundId: parsed.fundId,
                lastFour: parsed.lastFour,
                dryRun: false,
                correlationId: input.correlationId,
                agentId: input.agentId,
              });
          yield* audit.appendEntry(entry).pipe(Effect.catchAll(() => Effect.void));

          return {
            id: parsed.id,
            fundId: parsed.fundId,
            lastFour: parsed.lastFour,
            pan: parsed.pan,
            cvv: parsed.cvv,
            expiration: parsed.expiration,
            amountUsd: input.limitUsd,
            agentScoped: input.agentScoped,
            issuancePath: "vault" as const,
            dryRun: false,
          } satisfies RampCardResult;
        });

      const agenticIssue = (input: {
        userId: string;
        amountUsd: number;
        displayName: string;
        allowedVendorIds?: string[];
        fundId?: string;
        merchantName?: string;
        merchantUrl?: string;
        merchantCountryCode?: string;
        rationale?: string;
        tenantId: string;
        agentId?: string;
        correlationId?: string;
      }) =>
        Effect.gen(function* () {
          const amountMinor = Math.round(input.amountUsd * 100);
          if (isRampDryRun(env)) {
            const id = `card_agentic_dry_${Date.now().toString(36)}`;
            yield* audit
              .appendEntry(
                buildRampAgentCardIssuedEntry({
                  tenantId: input.tenantId,
                  cardId: id,
                  fundId: input.fundId ?? `fund_dry_${id}`,
                  amountUsd: input.amountUsd,
                  lastFour: "4242",
                  dryRun: true,
                  correlationId: input.correlationId,
                  agentId: input.agentId,
                })
              )
              .pipe(Effect.catchAll(() => Effect.void));
            return {
              id,
              fundId: input.fundId ?? `fund_dry_${id}`,
              lastFour: "4242",
              amountUsd: input.amountUsd,
              agentScoped: true,
              issuancePath: "agentic" as const,
              dryRun: true,
            } satisfies RampCardResult;
          }

          let fundId = input.fundId?.trim();
          if (!fundId) {
            const fund = yield* createFund({
              displayName: input.displayName,
              limitUsd: input.amountUsd,
              interval: "TOTAL",
              tenantId: input.tenantId,
              correlationId: input.correlationId,
            });
            fundId = fund.id;
          }

          const token = yield* getToken();
          const useFundCreds = Boolean(
            input.merchantName?.trim() || env.RAMP_AGENTIC_CREDS_PATH?.trim()
          );
          const path = useFundCreds ? rampAgenticCredsPath(fundId, env) : rampAgenticIssuePath(env);
          const body = useFundCreds
            ? {
                amount: input.amountUsd,
                currency_code: "USD",
                ...(input.merchantName?.trim() ? { merchant_name: input.merchantName.trim() } : {}),
                ...(input.merchantUrl?.trim() ? { merchant_url: input.merchantUrl.trim() } : {}),
                ...(input.merchantCountryCode?.trim()
                  ? { merchant_country_code: input.merchantCountryCode.trim() }
                  : {}),
                rationale:
                  input.rationale?.trim() ||
                  `ClawQL agent card for ${input.agentId ?? input.userId}`,
                user_id: input.userId,
              }
            : {
                user_id: input.userId,
                display_name: input.displayName,
                fund_id: fundId,
                spending_restrictions: {
                  interval: "TOTAL",
                  limit: { amount: amountMinor, currency_code: "USD" },
                  ...(input.allowedVendorIds?.length
                    ? { allowed_vendors: input.allowedVendorIds }
                    : {}),
                },
                rationale:
                  input.rationale?.trim() ||
                  `ClawQL agent card for ${input.agentId ?? input.userId}`,
              };

          const res = yield* Effect.tryPromise({
            try: async () => {
              const response = await fetchImpl(`${rampApiBase(env)}${path}`, {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${token}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify(body),
              });
              const text = await response.text();
              if (!response.ok) {
                throw new RampError({
                  reason: `Ramp agentic card failed (${response.status}): ${text.slice(0, 200)}`,
                });
              }
              return JSON.parse(text) as Record<string, unknown>;
            },
            catch: (cause) =>
              cause instanceof RampError
                ? cause
                : new RampError({
                    reason: cause instanceof Error ? cause.message : "agentic card failed",
                    cause,
                  }),
          });

          const parsed = parseCardSecrets(res);
          const cardId = parsed.id || `agentic_${fundId}`;
          yield* audit
            .appendEntry(
              buildRampAgentCardIssuedEntry({
                tenantId: input.tenantId,
                cardId,
                fundId: parsed.fundId ?? fundId,
                amountUsd: input.amountUsd,
                lastFour: parsed.lastFour,
                dryRun: false,
                correlationId: input.correlationId,
                agentId: input.agentId,
              })
            )
            .pipe(Effect.catchAll(() => Effect.void));

          return {
            id: cardId,
            fundId: parsed.fundId ?? fundId,
            lastFour: parsed.lastFour,
            pan: parsed.pan,
            cvv: parsed.cvv,
            expiration: parsed.expiration,
            amountUsd: input.amountUsd,
            agentScoped: true,
            issuancePath: "agentic" as const,
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
        fundId?: string;
        merchantName?: string;
        merchantUrl?: string;
        merchantCountryCode?: string;
        rationale?: string;
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
          const tenantId = input.tenantId?.trim() || "default";
          const agentId = input.agentId?.trim() || input.userId.trim();
          const displayName = input.displayName?.trim() || `ClawQL agent ${agentId}`;

          if (isRampAgenticEnabled(env)) {
            return yield* agenticIssue({
              userId: input.userId.trim(),
              amountUsd: input.amountUsd,
              displayName,
              allowedVendorIds: input.allowedVendorIds,
              fundId: input.fundId,
              merchantName: input.merchantName,
              merchantUrl: input.merchantUrl,
              merchantCountryCode: input.merchantCountryCode,
              rationale: input.rationale,
              tenantId,
              agentId,
              correlationId: input.correlationId,
            });
          }

          return yield* vaultIssue({
            userId: input.userId.trim(),
            displayName,
            limitUsd: input.amountUsd,
            interval: "TOTAL",
            allowedVendorIds: input.allowedVendorIds,
            tenantId,
            agentId,
            correlationId: input.correlationId,
            agentScoped: true,
          });
        });

      const readAgenticCard = (input: { cardId: string }) =>
        Effect.gen(function* () {
          if (!isRampEnabled(env)) {
            return yield* Effect.fail(
              new RampError({ reason: "Ramp disabled — set CLAWQL_RAMP_ENABLED=1" })
            );
          }
          if (!isRampAgenticEnabled(env)) {
            return yield* Effect.fail(
              new RampError({
                reason:
                  "Agentic Ramp disabled — set CLAWQL_RAMP_AGENTIC=1 or include cards:read_agentic in RAMP_OAUTH_SCOPES",
              })
            );
          }
          const cardId = input.cardId.trim();
          if (!cardId) {
            return yield* Effect.fail(new RampError({ reason: "cardId required" }));
          }
          if (isRampDryRun(env)) {
            return {
              id: cardId,
              agentic: true,
              dry_run: true,
              last_four: "4242",
            };
          }
          const token = yield* getToken();
          return yield* Effect.tryPromise({
            try: async () => {
              const response = await fetchImpl(
                `${rampApiBase(env)}${rampAgenticReadPath(cardId, env)}`,
                {
                  method: "GET",
                  headers: { Authorization: `Bearer ${token}` },
                }
              );
              const text = await response.text();
              if (!response.ok) {
                throw new RampError({
                  reason: `Ramp agentic read failed (${response.status}): ${text.slice(0, 200)}`,
                });
              }
              return JSON.parse(text) as Record<string, unknown>;
            },
            catch: (cause) =>
              cause instanceof RampError
                ? cause
                : new RampError({
                    reason: cause instanceof Error ? cause.message : "agentic read failed",
                    cause,
                  }),
          });
        });

      return RampService.of({
        createFund,
        createVirtualCard,
        issueAgentCard,
        readAgenticCard,
      });
    })
  );
}
