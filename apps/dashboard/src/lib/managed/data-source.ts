import { Effect } from "effect";

export type ManagedDataSource = "auto" | "live" | "fixture";

export function readManagedDataSource(env: NodeJS.ProcessEnv = process.env): ManagedDataSource {
  const raw = (env.CLAWQL_MANAGED_DATA_SOURCE ?? "").trim().toLowerCase();
  if (raw === "live" || raw === "fixture" || raw === "auto") return raw;
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

/** Prefer live when `auto` and the live Effect yields a non-empty payload. */
export function resolveWithFallbackEffect<A>(input: {
  readonly source: ManagedDataSource;
  readonly live: Effect.Effect<A, unknown>;
  readonly fixture: A;
  readonly isLiveUseful: (value: A) => boolean;
}): Effect.Effect<{ readonly data: A; readonly source: "live" | "fixture" }> {
  return Effect.gen(function* () {
    if (input.source === "fixture") {
      return { data: input.fixture, source: "fixture" as const };
    }
    const liveResult = yield* input.live.pipe(
      Effect.map((data) => ({ data, source: "live" as const })),
      Effect.catch(() => Effect.succeed({ data: input.fixture, source: "fixture" as const })),
    );
    if (input.source === "live") return liveResult;
    if (input.isLiveUseful(liveResult.data)) return liveResult;
    return { data: input.fixture, source: "fixture" as const };
  });
}
