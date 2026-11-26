import { Effect } from "effect";

export type ManagedDataSource = "auto" | "live" | "fixture";

export function readManagedDataSource(env: NodeJS.ProcessEnv = process.env): ManagedDataSource {
  const raw = (env.CLAWQL_MANAGED_DATA_SOURCE ?? "").trim().toLowerCase();
  if (raw === "live" || raw === "fixture" || raw === "auto") {
    // Production auto must not fall through to Acme fixtures (audit 8.03).
    if (
      raw === "auto" &&
      (env.NODE_ENV ?? process.env.NODE_ENV) === "production" &&
      env.CLAWQL_E2E_HARNESS !== "1"
    ) {
      return "live";
    }
    return raw;
  }
  if (
    (env.NODE_ENV ?? process.env.NODE_ENV) === "production" &&
    env.CLAWQL_E2E_HARNESS !== "1"
  ) {
    return "live";
  }
  return "auto";
}

export function managedOrgId(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return (
    env.CLAWQL_MANAGED_ORG_ID?.trim() ||
    env.NEXT_PUBLIC_CLAWQL_MANAGED_ORG_ID?.trim() ||
    undefined
  );
}

export function managedTenantId(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return (
    env.CLAWQL_MANAGED_TENANT_ID?.trim() ||
    env.NEXT_PUBLIC_CLAWQL_MANAGED_TENANT_ID?.trim() ||
    undefined
  );
}

export function managedStripeCustomerId(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return (
    env.CLAWQL_STRIPE_CUSTOMER_ID?.trim() ||
    env.STRIPE_CUSTOMER_ID?.trim() ||
    undefined
  );
}

function allowFixtureFallback(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.CLAWQL_E2E_HARNESS === "1") return true;
  if ((env.NODE_ENV ?? process.env.NODE_ENV) === "production") return false;
  return true;
}

/** Prefer live when `auto` and the live Effect yields a non-empty payload. */
export function resolveWithFallbackEffect<A>(input: {
  readonly source: ManagedDataSource;
  readonly live: Effect.Effect<A, unknown>;
  readonly fixture: A;
  readonly isLiveUseful: (value: A) => boolean;
  /** Empty payload used when live is empty/failed and fixture fallback is refused. */
  readonly empty?: A;
  readonly env?: NodeJS.ProcessEnv;
}): Effect.Effect<{ readonly data: A; readonly source: "live" | "fixture" }> {
  return Effect.gen(function* () {
    const env = input.env ?? process.env;
    if (input.source === "fixture") {
      return { data: input.fixture, source: "fixture" as const };
    }

    if (input.source === "live") {
      // Live-only: surface failures as defects (E=never for the public Effect signature).
      const data = yield* input.live.pipe(Effect.orDie);
      return { data, source: "live" as const };
    }

    // auto
    type Resolved = { readonly data: A; readonly source: "live" | "fixture" };
    const liveResult: Resolved = yield* input.live.pipe(
      Effect.map((data): Resolved => ({ data, source: "live" })),
      Effect.catch((): Effect.Effect<Resolved> => {
        if (allowFixtureFallback(env)) {
          return Effect.succeed({ data: input.fixture, source: "fixture" });
        }
        const empty = input.empty !== undefined ? input.empty : input.fixture;
        // Mark as live so UI does not caption "Acme fixture" for failed/empty prod.
        return Effect.succeed({ data: empty, source: "live" });
      }),
    );
    if (input.isLiveUseful(liveResult.data)) return liveResult;
    if (allowFixtureFallback(env)) {
      return { data: input.fixture, source: "fixture" as const };
    }
    return liveResult;
  });
}
