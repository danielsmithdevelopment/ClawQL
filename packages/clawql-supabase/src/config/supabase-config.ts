import { Context, Data, Effect, Layer } from "effect";

export class SupabaseConfigError extends Data.TaggedError("SupabaseConfigError")<{
  readonly reason: string;
}> {}

export type SupabaseConfig = {
  readonly enabled: boolean;
  readonly url: string | undefined;
  readonly anonKey: string | undefined;
  readonly jwtSecret: string | undefined;
  readonly jwksUrl: string | undefined;
  readonly issuer: string | undefined;
  readonly audience: string;
};

function envTruthy(v: string | undefined): boolean {
  if (v === undefined) return false;
  const t = v.trim().toLowerCase();
  return t === "1" || t === "true" || t === "yes" || t === "on";
}

/** Load Supabase config from env (Effect-primary). */
export const loadSupabaseConfigEffect = (
  env: NodeJS.ProcessEnv = process.env
): Effect.Effect<SupabaseConfig> =>
  Effect.sync(() => {
    const url = env.CLAWQL_SUPABASE_URL?.trim() || undefined;
    const anonKey = env.CLAWQL_SUPABASE_ANON_KEY?.trim() || undefined;
    const jwtSecret = env.CLAWQL_SUPABASE_JWT_SECRET?.trim() || undefined;
    const jwksUrl =
      env.CLAWQL_SUPABASE_JWKS_URL?.trim() ||
      (url ? `${url.replace(/\/$/, "")}/auth/v1/.well-known/jwks.json` : undefined);
    const issuer =
      env.CLAWQL_SUPABASE_JWT_ISSUER?.trim() ||
      (url ? `${url.replace(/\/$/, "")}/auth/v1` : undefined);
    const audience = env.CLAWQL_SUPABASE_JWT_AUDIENCE?.trim() || "authenticated";
    const enabled =
      envTruthy(env.CLAWQL_ENABLE_SUPABASE) ||
      Boolean(url && (jwtSecret || env.CLAWQL_SUPABASE_JWKS_URL?.trim()));
    return { enabled, url, anonKey, jwtSecret, jwksUrl, issuer, audience };
  });

/** True when plugin registration should run. */
export const supabasePluginEnabledEffect = (
  env: NodeJS.ProcessEnv = process.env
): Effect.Effect<boolean> =>
  loadSupabaseConfigEffect(env).pipe(Effect.map((c) => c.enabled && Boolean(c.url)));

export function supabasePluginEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return Effect.runSync(supabasePluginEnabledEffect(env));
}

export class SupabaseConfigService extends Context.Service<
  SupabaseConfigService,
  {
    readonly load: (env?: NodeJS.ProcessEnv) => Effect.Effect<SupabaseConfig>;
    readonly requireConfigured: (
      env?: NodeJS.ProcessEnv
    ) => Effect.Effect<SupabaseConfig, SupabaseConfigError>;
  }
>()("clawql/SupabaseConfigService") {}

export const SupabaseConfigServiceLive = Layer.succeed(
  SupabaseConfigService,
  SupabaseConfigService.of({
    load: (env) => loadSupabaseConfigEffect(env),
    requireConfigured: (env) =>
      Effect.gen(function* () {
        const cfg = yield* loadSupabaseConfigEffect(env);
        if (!cfg.url) {
          return yield* Effect.fail(
            new SupabaseConfigError({
              reason: "CLAWQL_SUPABASE_URL is required when Supabase Auth is enabled",
            })
          );
        }
        if (!cfg.jwtSecret && !cfg.jwksUrl) {
          return yield* Effect.fail(
            new SupabaseConfigError({
              reason:
                "Set CLAWQL_SUPABASE_JWT_SECRET or CLAWQL_SUPABASE_JWKS_URL for access-token verify",
            })
          );
        }
        return cfg;
      }),
  })
);
