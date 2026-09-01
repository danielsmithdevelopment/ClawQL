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
import { ObservabilityQueryService } from "../query/federation.js";
import type {
  LogQueryRequest,
  MetricQueryRequest,
  ProfileQueryRequest,
  TraceQueryRequest,
} from "../query/types.js";
import { ObservabilityAuthError } from "../scopes.js";

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

export const authorizeObservabilityApiKeyEffect = (
  headers: ObservabilityHttpRequest["headers"],
  expected: string | undefined
): Effect.Effect<void, ObservabilityAuthError> =>
  Effect.gen(function* () {
    if (!expected) {
      return;
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
    if (presented !== expected) {
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
    const authErr = yield* authorizeObservabilityApiKeyEffect(req.headers, config.httpApiKey).pipe(
      Effect.as(null as string | null),
      Effect.catchIf(
        (err): err is ObservabilityAuthError => err instanceof ObservabilityAuthError,
        (err) => Effect.succeed(err.reason)
      )
    );
    if (authErr) {
      return json(401, { error: authErr });
    }

    const { pathname } = parseUrl(req.url);
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
      const outputPath = body.outputPath?.trim() || config.alloyOutputPath;
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
