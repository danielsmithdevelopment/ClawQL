import { timingSafeEqual } from "node:crypto";
import { dirname, resolve as resolvePath } from "node:path";

import { Effect } from "effect";

import { applyAlloyConfigEffect } from "../alloy/apply.js";
import { resolveAlloyReloadFromEnvEffect } from "../alloy/reload.js";
import { snapshotRegistriesForAlloyEffect } from "../alloy/from-registry.js";
import { ObservabilityError } from "../errors.js";
import { ObservabilityAlertingService } from "../alerting/service.js";
import { ObservabilityHealthService } from "../health/scheduler.js";
import { resolveTelemetrySigningKeyLayer } from "../secrets/telemetry-signing-key.js";
import { signTelemetryJwtWithResolvedKeyEffect } from "../telemetry-token.js";
import { readObservabilityHostConfigEffect } from "../host/config.js";
import { runObservabilityHostEffect } from "../host/runtime.js";
import { resolveObservabilitySessionForRuntimeEffect } from "../host/session-context.js";
import { packagePaths } from "../paths.js";
import { ObservabilityQueryService } from "../query/federation.js";
import type {
  LogQueryRequest,
  MetricQueryRequest,
  ProfileQueryRequest,
  TraceQueryRequest,
} from "../query/types.js";
import { ObservabilityAuthError } from "../scopes.js";

function timingSafeEqualString(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

/**
 * Audit 5.03 / W5: alloy apply may only write the configured river file or
 * another `.river` file in that same directory (not anywhere under the package).
 */
export function assertSafeAlloyOutputPath(
  requested: string,
  configuredDefault: string
): Effect.Effect<string, ObservabilityError> {
  return Effect.gen(function* () {
    const resolved = resolvePath(requested);
    const allowedFiles = new Set([
      resolvePath(configuredDefault),
      resolvePath(packagePaths.alloyConfig),
      resolvePath(packagePaths.alloySecuritySensors),
    ]);
    const allowedDirs = new Set([...allowedFiles].map((f) => dirname(f)));
    const ok =
      allowedFiles.has(resolved) ||
      (resolved.endsWith(".river") && allowedDirs.has(dirname(resolved)));
    if (!ok) {
      return yield* Effect.fail(
        new ObservabilityError({
          reason: `alloy outputPath refused (must be a .river under the configured alloy dir): ${requested}`,
        })
      );
    }
    return resolved;
  });
}

export type ObservabilityHttpRequest = {
  readonly method: string;
  readonly url: string;
  readonly headers: Record<string, string | string[] | undefined>;
  readonly body?: unknown;
};

export type ObservabilityHttpResponse = {
  readonly status: number;
  readonly headers?: Record<string, string>;
  readonly body: unknown;
};

const json = (status: number, body: unknown): ObservabilityHttpResponse => ({
  status,
  headers: { "content-type": "application/json; charset=utf-8" },
  body,
});

const parseUrl = (url: string): { pathname: string } => {
  const u = new URL(url, "http://localhost");
  return { pathname: u.pathname };
};

const observabilityAllowUnauthenticated = (env: NodeJS.ProcessEnv): boolean => {
  const raw = env.CLAWQL_OBSERVABILITY_ALLOW_UNAUTHENTICATED?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
};

/**
 * Audit 5.03: observability HTTP is fail-closed when CLAWQL_OBSERVABILITY_API_KEY
 * is unset (except health probes). Opt out only with
 * CLAWQL_OBSERVABILITY_ALLOW_UNAUTHENTICATED=1 for local demos.
 */
export const authorizeObservabilityApiKeyEffect = (
  headers: ObservabilityHttpRequest["headers"],
  expected: string | undefined,
  opts: { pathname?: string; env?: NodeJS.ProcessEnv } = {}
): Effect.Effect<void, ObservabilityAuthError> =>
  Effect.gen(function* () {
    const pathname = opts.pathname ?? "";
    const env = opts.env ?? process.env;
    // Liveness/readiness may stay open for kube probes.
    if (pathname === "/observability/health") {
      return;
    }
    if (!expected) {
      if (observabilityAllowUnauthenticated(env)) {
        return;
      }
      return yield* Effect.fail(
        new ObservabilityAuthError({
          scope: "observability:configure",
          reason:
            "CLAWQL_OBSERVABILITY_API_KEY is required (or set CLAWQL_OBSERVABILITY_ALLOW_UNAUTHENTICATED=1 for local demos only)",
        })
      );
    }
    const raw = headers.authorization ?? headers.Authorization;
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (!value || !value.startsWith("ApiKey ")) {
      return yield* Effect.fail(
        new ObservabilityAuthError({
          scope: "observability:configure",
          reason: "Missing Authorization: ApiKey …",
        })
      );
    }
    const presented = value.slice("ApiKey ".length).trim();
    if (!timingSafeEqualString(presented, expected)) {
      return yield* Effect.fail(
        new ObservabilityAuthError({
          scope: "observability:configure",
          reason: "Invalid API key",
        })
      );
    }
  });

const readJsonBody = <T>(body: unknown): Effect.Effect<T, ObservabilityError> =>
  Effect.try({
    try: () => body as T,
    catch: (cause) =>
      new ObservabilityError({
        reason: "Invalid JSON request body",
        cause,
      }),
  });

export const handleObservabilityHttpRequestEffect = (
  req: ObservabilityHttpRequest,
  env: NodeJS.ProcessEnv = process.env
): Effect.Effect<ObservabilityHttpResponse> =>
  Effect.gen(function* () {
    const config = yield* readObservabilityHostConfigEffect(env);
    const { pathname } = parseUrl(req.url);
    const authErr = yield* authorizeObservabilityApiKeyEffect(req.headers, config.httpApiKey, {
      pathname,
      env,
    }).pipe(
      Effect.as(null as string | null),
      Effect.catchIf(
        (err): err is ObservabilityAuthError => err instanceof ObservabilityAuthError,
        (err) => Effect.succeed(err.reason)
      )
    );
    if (authErr) {
      return json(401, { error: authErr });
    }

    const session = yield* resolveObservabilitySessionForRuntimeEffect(env);

    if (req.method === "GET" && pathname === "/observability/health") {
      const snapshot = yield* Effect.tryPromise({
        try: () =>
          runObservabilityHostEffect(
            Effect.gen(function* () {
              const health = yield* ObservabilityHealthService;
              return yield* health.runOnce();
            }),
            env
          ),
        catch: (cause) =>
          new ObservabilityError({
            reason: "observability health check failed",
            cause,
          }),
      });
      return json(200, snapshot);
    }

    if (req.method === "POST" && pathname === "/observability/query/logs") {
      const body = yield* readJsonBody<LogQueryRequest>(req.body);
      const result = yield* Effect.tryPromise({
        try: () =>
          runObservabilityHostEffect(
            Effect.gen(function* () {
              const query = yield* ObservabilityQueryService;
              return yield* query.queryLogs(session, body);
            }),
            env
          ),
        catch: (cause) =>
          new ObservabilityError({
            reason: "observability log query failed",
            cause,
          }),
      });
      return json(200, result);
    }

    if (req.method === "POST" && pathname === "/observability/query/metrics") {
      const body = yield* readJsonBody<MetricQueryRequest>(req.body);
      const result = yield* Effect.tryPromise({
        try: () =>
          runObservabilityHostEffect(
            Effect.gen(function* () {
              const query = yield* ObservabilityQueryService;
              return yield* query.queryMetrics(session, body);
            }),
            env
          ),
        catch: (cause) =>
          new ObservabilityError({
            reason: "observability metric query failed",
            cause,
          }),
      });
      return json(200, result);
    }

    if (req.method === "POST" && pathname === "/observability/query/traces") {
      const body = yield* readJsonBody<TraceQueryRequest>(req.body);
      const result = yield* Effect.tryPromise({
        try: () =>
          runObservabilityHostEffect(
            Effect.gen(function* () {
              const query = yield* ObservabilityQueryService;
              return yield* query.queryTraces(session, body);
            }),
            env
          ),
        catch: (cause) =>
          new ObservabilityError({
            reason: "observability trace query failed",
            cause,
          }),
      });
      return json(200, result);
    }

    if (req.method === "POST" && pathname === "/observability/query/profiles") {
      const body = yield* readJsonBody<ProfileQueryRequest>(req.body);
      const result = yield* Effect.tryPromise({
        try: () =>
          runObservabilityHostEffect(
            Effect.gen(function* () {
              const query = yield* ObservabilityQueryService;
              return yield* query.queryProfiles(session, body);
            }),
            env
          ),
        catch: (cause) =>
          new ObservabilityError({
            reason: "observability profile query failed",
            cause,
          }),
      });
      return json(200, result);
    }

    if (req.method === "GET" && pathname === "/observability/alerts") {
      const events = yield* Effect.tryPromise({
        try: () =>
          runObservabilityHostEffect(
            Effect.gen(function* () {
              const alerting = yield* ObservabilityAlertingService;
              return yield* alerting.evaluateHealth();
            }),
            env
          ),
        catch: (cause) =>
          new ObservabilityError({
            reason: "observability alerts evaluation failed",
            cause,
          }),
      });
      return json(200, { events });
    }

    if (req.method === "POST" && pathname === "/observability/telemetry/token") {
      const body = (req.body ?? {}) as {
        claims?: Record<string, unknown>;
        ttlSeconds?: number;
      };
      const claims = body.claims;
      if (!claims || typeof claims !== "object") {
        return json(400, { error: "claims_required" });
      }
      const minted = yield* signTelemetryJwtWithResolvedKeyEffect({
        claims: claims as never,
        ttlSeconds: body.ttlSeconds,
      }).pipe(Effect.provide(resolveTelemetrySigningKeyLayer(env)));
      return json(200, {
        token: minted.token,
        expiresAt: minted.expiresAt,
        keySource: minted.keySource,
      });
    }

    if (req.method === "POST" && pathname === "/observability/alloy/apply") {
      const body = (req.body ?? {}) as { outputPath?: string };
      const requested = body.outputPath?.trim() || config.alloyOutputPath;
      const outputPath = yield* assertSafeAlloyOutputPath(requested, config.alloyOutputPath);
      const result = yield* Effect.tryPromise({
        try: () =>
          runObservabilityHostEffect(
            Effect.gen(function* () {
              const generation = yield* snapshotRegistriesForAlloyEffect();
              const { reload } = yield* resolveAlloyReloadFromEnvEffect(env);
              return yield* applyAlloyConfigEffect({
                session,
                actorId: session.sub,
                generation,
                outputPath,
                reload,
              });
            }),
            env
          ),
        catch: (cause) =>
          new ObservabilityError({
            reason: "observability alloy apply failed",
            cause,
          }),
      });
      return json(200, result);
    }

    return json(404, { error: "not_found", path: pathname });
  }).pipe(
    Effect.catchIf(
      (err): err is ObservabilityError => err instanceof ObservabilityError,
      (err) => Effect.succeed(json(500, { error: "observability_error", reason: err.reason }))
    )
  );

/** Express-style mount helper for governed observability HTTP read/configure routes. */
export const attachObservabilityHttpRoutes = (
  app: {
    get: (path: string, handler: (req: unknown, res: unknown) => void) => void;
    post: (path: string, handler: (req: unknown, res: unknown) => void) => void;
  },
  env: NodeJS.ProcessEnv = process.env
): void => {
  const send = async (
    req: {
      method: string;
      originalUrl?: string;
      url?: string;
      headers: ObservabilityHttpRequest["headers"];
      body?: unknown;
    },
    res: { status: (code: number) => { json: (body: unknown) => void } }
  ) => {
    const response = await Effect.runPromise(
      handleObservabilityHttpRequestEffect(
        {
          method: req.method,
          url: req.originalUrl ?? req.url ?? "/",
          headers: req.headers,
          body: req.body,
        },
        env
      )
    );
    res.status(response.status).json(response.body);
  };

  app.get("/observability/health", (req, res) => {
    void send(req as Parameters<typeof send>[0], res as Parameters<typeof send>[1]);
  });
  app.post("/observability/query/logs", (req, res) => {
    void send(req as Parameters<typeof send>[0], res as Parameters<typeof send>[1]);
  });
  app.post("/observability/query/metrics", (req, res) => {
    void send(req as Parameters<typeof send>[0], res as Parameters<typeof send>[1]);
  });
  app.post("/observability/query/traces", (req, res) => {
    void send(req as Parameters<typeof send>[0], res as Parameters<typeof send>[1]);
  });
  app.post("/observability/query/profiles", (req, res) => {
    void send(req as Parameters<typeof send>[0], res as Parameters<typeof send>[1]);
  });
  app.get("/observability/alerts", (req, res) => {
    void send(req as Parameters<typeof send>[0], res as Parameters<typeof send>[1]);
  });
  app.post("/observability/telemetry/token", (req, res) => {
    void send(req as Parameters<typeof send>[0], res as Parameters<typeof send>[1]);
  });
  app.post("/observability/alloy/apply", (req, res) => {
    void send(req as Parameters<typeof send>[0], res as Parameters<typeof send>[1]);
  });
};
