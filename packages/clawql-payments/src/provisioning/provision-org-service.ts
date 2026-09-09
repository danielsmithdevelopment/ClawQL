/**
 * Customer Provisioning Core — one Effect `provisionOrg` for self-serve + enterprise.
 * @see docs/specs/billing/customer-provisioning-core-v0.1.md
 */

import { join } from "node:path";
import {
  createIssuedApiKeyStoreLayer,
  IssuedApiKeyStoreService,
  type ApiKeyStoreError,
} from "clawql-auth";
import { Context, Data, Effect, Layer } from "effect";
import {
  buildOrgMemberAddedEntry,
  buildOrgProvisionedEntry,
} from "../audit/events.js";
import { resolveIssuedApiKeysPath } from "../config/paths.js";
import { isCreditsEnabled } from "../credits/config.js";
import {
  createOrg,
  getOrg,
  inviteOrgMember,
  patchOrgBilling,
  poolTenantIdForOrg,
  type OrgRecord,
} from "../credits/org.js";
import { CreditsLedgerService, type LedgerError } from "../credits/ledger.js";
import { PaymentError } from "../errors/payment-errors.js";
import { isClawqlPlanId } from "../plans/tiers.js";
import { PaymentAuditService } from "../plugin/payment-audit-service.js";
import {
  apiKeyScopesForPlan,
  defaultAllowedEmailDomains,
  ownerTenantIdForOrg,
  slugifyOrgId,
} from "./helpers.js";
import type { ProvisionOrgInput, ProvisionOrgResult } from "./types.js";

export class ProvisionOrgError extends Data.TaggedError("ProvisionOrgError")<{
  readonly reason: string;
  readonly cause?: unknown;
}> {}

export class ProvisionOrgService extends Context.Tag("clawql/ProvisionOrgService")<
  ProvisionOrgService,
  {
    readonly provisionOrg: (
      input: ProvisionOrgInput
    ) => Effect.Effect<
      ProvisionOrgResult,
      ProvisionOrgError | PaymentError | ApiKeyStoreError | LedgerError
    >;
  }
>() {}

function parseProvisionInput(input: ProvisionOrgInput): Effect.Effect<
  {
    orgId: string;
    ownerEmail: string;
    ownerMemberTenantId: string;
    displayName: string;
  },
  ProvisionOrgError
> {
  return Effect.gen(function* () {
    const displayName = input.orgName.trim();
    if (!displayName) {
      return yield* Effect.fail(new ProvisionOrgError({ reason: "orgName is required" }));
    }
    const ownerEmail = input.ownerEmail.trim().toLowerCase();
    if (!ownerEmail.includes("@")) {
      return yield* Effect.fail(
        new ProvisionOrgError({ reason: "ownerEmail must be a valid email" })
      );
    }
    if (!isClawqlPlanId(input.planId)) {
      return yield* Effect.fail(
        new ProvisionOrgError({ reason: `Invalid planId: ${input.planId}` })
      );
    }
    const orgId = (input.orgId?.trim() || slugifyOrgId(displayName)).toLowerCase();
    if (!orgId) {
      return yield* Effect.fail(
        new ProvisionOrgError({ reason: "orgId could not be derived from orgName" })
      );
    }
    const ownerMemberTenantId =
      input.ownerMemberTenantId?.trim() || ownerTenantIdForOrg(orgId, ownerEmail);
    return { orgId, ownerEmail, ownerMemberTenantId, displayName };
  });
}

export function provisionOrgLiveLayer(
  env: NodeJS.ProcessEnv = process.env
): Layer.Layer<
  ProvisionOrgService,
  never,
  PaymentAuditService | IssuedApiKeyStoreService | CreditsLedgerService
> {
  return Layer.effect(
    ProvisionOrgService,
    Effect.gen(function* () {
      const audit = yield* PaymentAuditService;
      const apiKeys = yield* IssuedApiKeyStoreService;
      const ledger = yield* CreditsLedgerService;

      const provisionOrg = (input: ProvisionOrgInput) =>
        Effect.gen(function* () {
          const runEnv = input.env ?? env;
          if (!Effect.runSync(isCreditsEnabled(runEnv))) {
            return yield* Effect.fail(
              new ProvisionOrgError({
                reason: "Credits disabled — set CLAWQL_CREDITS_ENABLED=1",
              })
            );
          }

          const parsed = yield* parseProvisionInput(input);
          const existing = yield* Effect.tryPromise({
            try: () => getOrg(parsed.orgId, runEnv),
            catch: (cause) =>
              new ProvisionOrgError({ reason: "Failed to load org store", cause }),
          });

          let org: OrgRecord;
          if (existing) {
            org = yield* Effect.tryPromise({
              try: () =>
                patchOrgBilling(
                  {
                    orgId: parsed.orgId,
                    planId: input.planId,
                    billingMode: input.billingMode,
                    createdVia: input.createdVia,
                    stripeCustomerId: input.stripeCustomerId,
                    stripeSubscriptionId: input.stripeSubscriptionId,
                    seatLimit: input.seatLimit,
                  },
                  runEnv
                ),
              catch: (cause) =>
                new ProvisionOrgError({
                  reason: cause instanceof Error ? cause.message : "patchOrgBilling failed",
                  cause,
                }),
            });
          } else {
            const domains = defaultAllowedEmailDomains(
              parsed.ownerEmail,
              input.allowedEmailDomains
            );
            org = yield* Effect.tryPromise({
              try: () =>
                createOrg(
                  {
                    orgId: parsed.orgId,
                    displayName: parsed.displayName,
                    billingAdminTenantId: parsed.ownerMemberTenantId,
                    billingAdminEmail: parsed.ownerEmail,
                    planId: input.planId,
                    seatLimit: input.seatLimit,
                    allowedEmailDomains: domains,
                    createdVia: input.createdVia,
                    billingMode: input.billingMode,
                    stripeCustomerId: input.stripeCustomerId,
                    stripeSubscriptionId: input.stripeSubscriptionId,
                  },
                  runEnv
                ),
              catch: (cause) =>
                new ProvisionOrgError({
                  reason: cause instanceof Error ? cause.message : "createOrg failed",
                  cause,
                }),
            });
          }

          yield* ledger.getAccount(org.poolTenantId);
          yield* ledger.getAccount(parsed.ownerMemberTenantId);

          for (const rawEmail of input.additionalMemberEmails ?? []) {
            const email = rawEmail.trim().toLowerCase();
            if (!email || email === parsed.ownerEmail) continue;
            org = yield* Effect.tryPromise({
              try: () =>
                inviteOrgMember(
                  {
                    orgId: org.orgId,
                    actorTenantId: parsed.ownerMemberTenantId,
                    email,
                    allocationRoleId: "employee",
                    orgRole: "member",
                  },
                  runEnv
                ),
              catch: (cause) =>
                new ProvisionOrgError({
                  reason:
                    cause instanceof Error
                      ? cause.message
                      : `inviteOrgMember failed for ${email}`,
                  cause,
                }),
            });
            const member = org.members.find((m) => m.email === email);
            if (member) {
              yield* ledger.getAccount(member.memberTenantId);
              yield* audit.appendEntry(
                buildOrgMemberAddedEntry({
                  orgId: org.orgId,
                  memberTenantId: member.memberTenantId,
                  orgRole: member.orgRole,
                  correlationId: input.correlationId,
                })
              );
            }
          }

          let apiKey: string | undefined;
          let apiKeyId: string | undefined;
          if (!input.skipApiKey) {
            const issued = yield* apiKeys.issue({
              subjectId: parsed.ownerMemberTenantId,
              orgId: org.orgId,
              role: "billing_admin",
              scope: apiKeyScopesForPlan(input.planId),
              label: `default:${org.orgId}`,
            });
            apiKey = issued.secret;
            apiKeyId = issued.record.id;
          }

          if (!existing) {
            yield* audit.appendEntry(
              buildOrgProvisionedEntry({
                orgId: org.orgId,
                ownerTenantId: parsed.ownerMemberTenantId,
                planId: input.planId,
                billingMode: input.billingMode,
                createdVia: input.createdVia,
                correlationId: input.correlationId,
              })
            );
            yield* audit.appendEntry(
              buildOrgMemberAddedEntry({
                orgId: org.orgId,
                memberTenantId: parsed.ownerMemberTenantId,
                orgRole: "billing_admin",
                correlationId: input.correlationId,
              })
            );
          }

          return {
            orgId: org.orgId,
            poolTenantId: org.poolTenantId || poolTenantIdForOrg(org.orgId),
            ownerMemberTenantId: parsed.ownerMemberTenantId,
            apiKey,
            apiKeyId,
            planId: input.planId,
            billingMode: input.billingMode,
            createdVia: input.createdVia,
          } satisfies ProvisionOrgResult;
        });

      return ProvisionOrgService.of({ provisionOrg });
    })
  );
}

/** File-backed issued API key store Layer for CPC (default Auth/api-keys.json). */
export function issuedApiKeyStoreLiveLayer(
  env: NodeJS.ProcessEnv = process.env
): Layer.Layer<IssuedApiKeyStoreService> {
  return createIssuedApiKeyStoreLayer({
    path: resolveIssuedApiKeysPath(env),
  });
}

/** Test helper: isolated API key store under a temp CLAWQL_HOME. */
export function issuedApiKeyStoreForHomeLayer(
  home: string
): Layer.Layer<IssuedApiKeyStoreService> {
  return createIssuedApiKeyStoreLayer({
    path: join(home, "Auth", "api-keys.json"),
  });
}
