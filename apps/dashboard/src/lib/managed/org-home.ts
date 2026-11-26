/**
 * Org-scoped CLAWQL_HOME paths for managed console stores (CC1 remainder).
 *
 * When multi-tenant mode is on (`CLAWQL_MANAGED_ORG_ID` set **or**
 * `CLAWQL_MANAGED_MULTI_TENANT=1`), durable paths live under
 * `$CLAWQL_HOME/orgs/<orgId>/…` so org B cannot read org A's review / audit /
 * memory / keys on a shared volume. Single-tenant (neither flag) keeps the
 * historical flat layout under `$CLAWQL_HOME`.
 */
import { Context, Data, Effect, Layer } from "effect";
import { join } from "node:path";

export class OrgHomeError extends Data.TaggedError("OrgHomeError")<{
  readonly reason: "org_required" | "org_invalid";
  readonly detail?: string;
}> {}

export type OrgHomeInput = {
  /** Absolute or relative CLAWQL_HOME root (before org partition). */
  readonly home: string;
  /** Trusted session / deploy org id — required in multi-tenant mode. */
  readonly orgId?: string | null;
  readonly env?: NodeJS.ProcessEnv;
};

const truthy = (raw: string | undefined): boolean => {
  const v = (raw ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
};

/**
 * Multi-tenant store partitioning is on when the deploy binds an org id
 * (`CLAWQL_MANAGED_ORG_ID`) or explicitly opts into shared-home multi-tenancy.
 */
export const isManagedMultiTenantModeEffect = (
  env: NodeJS.ProcessEnv = process.env,
): Effect.Effect<boolean> =>
  Effect.sync(() => {
    if (truthy(env.CLAWQL_MANAGED_MULTI_TENANT)) return true;
    const org =
      env.CLAWQL_MANAGED_ORG_ID?.trim() ||
      env.NEXT_PUBLIC_CLAWQL_MANAGED_ORG_ID?.trim();
    return Boolean(org);
  });

/** Reject empty ids and path-traversal / separator characters. */
export const sanitizeManagedOrgIdEffect = (
  orgId: string | null | undefined,
): Effect.Effect<string, OrgHomeError> =>
  Effect.sync(() => (orgId ?? "").trim()).pipe(
    Effect.flatMap((id) => {
      if (!id) {
        return Effect.fail(
          new OrgHomeError({
            reason: "org_required",
            detail:
              "orgId required when CLAWQL_MANAGED_ORG_ID or CLAWQL_MANAGED_MULTI_TENANT is set",
          }),
        );
      }
      if (
        id.includes("..") ||
        id.includes("/") ||
        id.includes("\\") ||
        id.includes("\0")
      ) {
        return Effect.fail(
          new OrgHomeError({
            reason: "org_invalid",
            detail: "orgId must not contain path separators or ..",
          }),
        );
      }
      return Effect.succeed(id);
    }),
  );

/**
 * Apply org partition to a home root.
 * Single-tenant: returns `home` unchanged.
 * Multi-tenant: `join(home, "orgs", orgId)` — fails closed without a valid orgId.
 */
export const orgScopedHomeEffect = (
  input: OrgHomeInput,
): Effect.Effect<string, OrgHomeError> =>
  Effect.gen(function* () {
    const env = input.env ?? process.env;
    const multi = yield* isManagedMultiTenantModeEffect(env);
    if (!multi) return input.home;
    const orgId = yield* sanitizeManagedOrgIdEffect(input.orgId);
    return join(input.home, "orgs", orgId);
  });

/** Default dashboard managed home: `$CLAWQL_HOME` or `cwd/.clawql`, then org-scoped. */
export const resolveDashboardManagedHomeEffect = (input: {
  readonly orgId?: string | null;
  readonly env?: NodeJS.ProcessEnv;
}): Effect.Effect<string, OrgHomeError> =>
  Effect.gen(function* () {
    const env = input.env ?? process.env;
    const root = env.CLAWQL_HOME?.trim() || join(process.cwd(), ".clawql");
    return yield* orgScopedHomeEffect({ home: root, orgId: input.orgId, env });
  });

/**
 * Resolve a store file/dir under the org-scoped home.
 * Absolute path overrides (`overrideEnvKey`) are honored **only** in
 * single-tenant mode so a shared override cannot cross tenants.
 */
export const resolveManagedStorePathEffect = (input: {
  readonly orgId?: string | null;
  readonly segments: readonly string[];
  readonly env?: NodeJS.ProcessEnv;
  readonly overrideEnvKey?: string;
}): Effect.Effect<string, OrgHomeError> =>
  Effect.gen(function* () {
    const env = input.env ?? process.env;
    const multi = yield* isManagedMultiTenantModeEffect(env);
    const override = input.overrideEnvKey
      ? env[input.overrideEnvKey]?.trim()
      : undefined;
    if (override && !multi) return override;
    const home = yield* resolveDashboardManagedHomeEffect({
      orgId: input.orgId,
      env,
    });
    return join(home, ...input.segments);
  });

export const CLAWQL_ORG_HOME_TAG = "clawql/ManagedOrgHome" as const;

export class ManagedOrgHomeService extends Context.Service<
  typeof CLAWQL_ORG_HOME_TAG,
  {
    readonly isMultiTenant: (
      env?: NodeJS.ProcessEnv,
    ) => Effect.Effect<boolean>;
    readonly resolveHome: (input: {
      readonly orgId?: string | null;
      readonly env?: NodeJS.ProcessEnv;
    }) => Effect.Effect<string, OrgHomeError>;
    readonly resolveStorePath: (input: {
      readonly orgId?: string | null;
      readonly segments: readonly string[];
      readonly env?: NodeJS.ProcessEnv;
      readonly overrideEnvKey?: string;
    }) => Effect.Effect<string, OrgHomeError>;
  }
>()(CLAWQL_ORG_HOME_TAG) {}

export const ManagedOrgHomeLive = Layer.succeed(ManagedOrgHomeService, {
  isMultiTenant: isManagedMultiTenantModeEffect,
  resolveHome: resolveDashboardManagedHomeEffect,
  resolveStorePath: resolveManagedStorePathEffect,
});
