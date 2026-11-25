/**
 * Managed cloud.clawql.com console session.
 * Prefers Supabase Auth; falls back to Acme fixture when mock is allowed.
 */
import { Context, Data, Effect, Layer } from "effect";

export type ManagedAuthMode = "supabase" | "mock";

export type ManagedSession = {
  readonly mode: ManagedAuthMode;
  readonly userId: string;
  readonly email: string;
  readonly displayName: string;
  readonly role: string;
  readonly initials: string;
  readonly orgId: string;
  readonly orgName: string;
  readonly planLabel: string;
  readonly accessToken?: string;
};

export class ManagedSessionError extends Data.TaggedError("ManagedSessionError")<{
  readonly reason: string;
}> {}

export const MOCK_MANAGED_SESSION: ManagedSession = {
  mode: "mock",
  userId: "mock-dana-reyes",
  email: "dana@acme.example",
  displayName: "Dana Reyes",
  role: "Org admin",
  initials: "DR",
  orgId: "org_acme_robotics",
  orgName: "Acme Robotics",
  planLabel: "Team plan",
};

function envTruthy(v: string | undefined): boolean {
  if (v === undefined) return false;
  const t = v.trim().toLowerCase();
  return t === "1" || t === "true" || t === "yes" || t === "on";
}

export type ManagedAuthConfig = {
  readonly supabaseUrl: string | undefined;
  readonly supabaseAnonKey: string | undefined;
  readonly allowMock: boolean;
};

/** Resolve public Supabase + mock flags for the managed console. */
export const loadManagedAuthConfigEffect = (
  env: NodeJS.ProcessEnv = process.env,
): Effect.Effect<ManagedAuthConfig> =>
  Effect.sync(() => {
    const supabaseUrl =
      env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
      env.CLAWQL_SUPABASE_URL?.trim() ||
      undefined;
    const supabaseAnonKey =
      env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
      env.CLAWQL_SUPABASE_ANON_KEY?.trim() ||
      undefined;
    const forceMock = envTruthy(env.CLAWQL_MANAGED_AUTH_MOCK);
    const configured = Boolean(supabaseUrl && supabaseAnonKey);
    const isProd = (env.NODE_ENV ?? process.env.NODE_ENV) === "production";
    const e2e = env.CLAWQL_E2E_HARNESS === "1";
    const desktopFixture =
      envTruthy(env.CLAWQL_DESKTOP_MODE) && envTruthy(env.CLAWQL_DESKTOP_MANAGED_FIXTURE);
    // Cloud production never allows mock (audit 8.01). Desktop local fixture and E2E may.
    const allowMock =
      e2e ||
      desktopFixture ||
      (!isProd && (forceMock || !configured));
    return {
      supabaseUrl: supabaseUrl?.replace(/\/$/, ""),
      supabaseAnonKey,
      allowMock,
    };
  });

export const resolveManagedSessionEffect = (input: {
  readonly accessToken?: string | null;
  readonly env?: NodeJS.ProcessEnv;
}): Effect.Effect<ManagedSession, ManagedSessionError> =>
  Effect.gen(function* () {
    const env = input.env ?? process.env;
    const cfg = yield* loadManagedAuthConfigEffect(env);
    const token = input.accessToken?.trim();

    if (token && cfg.supabaseUrl && cfg.supabaseAnonKey) {
      const claims = yield* fetchSupabaseUserEffect({
        url: cfg.supabaseUrl,
        anonKey: cfg.supabaseAnonKey,
        accessToken: token,
      });
      const orgFromEnv =
        env.CLAWQL_MANAGED_ORG_ID?.trim() ||
        env.NEXT_PUBLIC_CLAWQL_MANAGED_ORG_ID?.trim() ||
        undefined;
      return {
        mode: "supabase" as const,
        userId: claims.userId,
        email: claims.email,
        displayName: claims.displayName,
        role: claims.role,
        initials: initialsFromName(claims.displayName),
        orgId: claims.orgId || orgFromEnv || "org_pending",
        orgName: claims.orgName,
        planLabel: claims.planLabel,
        accessToken: token,
      };
    }

    if (cfg.allowMock) {
      return MOCK_MANAGED_SESSION;
    }

    return yield* Effect.fail(
      new ManagedSessionError({
        reason:
          "Supabase Auth is required for the managed console. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY, or CLAWQL_MANAGED_AUTH_MOCK=1 for local UI work.",
      }),
    );
  });

type SupabaseUserClaims = {
  readonly userId: string;
  readonly email: string;
  readonly displayName: string;
  readonly role: string;
  readonly orgId: string | undefined;
  readonly orgName: string;
  readonly planLabel: string;
};

const fetchSupabaseUserEffect = (input: {
  readonly url: string;
  readonly anonKey: string;
  readonly accessToken: string;
}): Effect.Effect<SupabaseUserClaims, ManagedSessionError> =>
  Effect.tryPromise({
    try: async () => {
      const res = await fetch(`${input.url}/auth/v1/user`, {
        headers: {
          apikey: input.anonKey,
          Authorization: `Bearer ${input.accessToken}`,
        },
      });
      const body = (await res.json().catch(() => ({}))) as {
        id?: string;
        email?: string;
        app_metadata?: {
          org_id?: string;
          org_name?: string;
          role?: string;
          plan?: string;
          plan_label?: string;
        };
        user_metadata?: {
          full_name?: string;
          name?: string;
          org_id?: string;
          org_name?: string;
          role?: string;
          plan?: string;
          plan_label?: string;
        };
        msg?: string;
        message?: string;
        error_description?: string;
      };
      if (!res.ok) {
        throw new Error(
          body.error_description || body.msg || body.message || `Supabase user lookup failed (${res.status})`,
        );
      }
      const userId = body.id?.trim();
      if (!userId) throw new Error("Supabase user response missing id");
      const email = body.email?.trim() || "unknown@example.com";
      const meta = { ...body.app_metadata, ...body.user_metadata };
      const displayName =
        body.user_metadata?.full_name?.trim() ||
        body.user_metadata?.name?.trim() ||
        email.split("@")[0] ||
        "User";
      const role = meta.role?.trim() || "Member";
      const orgId = meta.org_id?.trim() || undefined;
      const orgName = meta.org_name?.trim() || "Your organization";
      const planLabel =
        meta.plan_label?.trim() || meta.plan?.trim() || "Team plan";
      return { userId, email, displayName, role, orgId, orgName, planLabel };
    },
    catch: (cause) =>
      new ManagedSessionError({
        reason: cause instanceof Error ? cause.message : "Supabase session verification failed",
      }),
  });

export function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
}

export class ManagedSessionService extends Context.Service<
  ManagedSessionService,
  {
    readonly loadConfig: (env?: NodeJS.ProcessEnv) => Effect.Effect<ManagedAuthConfig>;
    readonly resolve: (input: {
      readonly accessToken?: string | null;
      readonly env?: NodeJS.ProcessEnv;
    }) => Effect.Effect<ManagedSession, ManagedSessionError>;
  }
>()("clawql/ManagedSessionService") {}

export const ManagedSessionServiceLive = Layer.succeed(
  ManagedSessionService,
  ManagedSessionService.of({
    loadConfig: (env) => loadManagedAuthConfigEffect(env),
    resolve: (input) => resolveManagedSessionEffect(input),
  }),
);

/** Host boundary for Next.js route handlers / server components. */
export function resolveManagedSessionSync(input: {
  readonly accessToken?: string | null;
  readonly env?: NodeJS.ProcessEnv;
}): ManagedSession {
  return Effect.runSync(
    resolveManagedSessionEffect(input).pipe(
      Effect.catchTag("ManagedSessionError", (e) => {
        const env = input.env ?? process.env;
        const isProd = (env.NODE_ENV ?? process.env.NODE_ENV) === "production";
        const e2e = env.CLAWQL_E2E_HARNESS === "1";
        const desktopFixture =
          envTruthy(env.CLAWQL_DESKTOP_MODE) && envTruthy(env.CLAWQL_DESKTOP_MANAGED_FIXTURE);
        // Dev / E2E / desktop fixture only — never silently fixture an unauthenticated cloud prod session.
        if (!isProd || e2e || desktopFixture) {
          return Effect.succeed(MOCK_MANAGED_SESSION);
        }
        return Effect.die(new Error(e.reason));
      }),
    ),
  );
}
