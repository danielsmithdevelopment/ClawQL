import express, { type Express } from "express";
import { createX402PaymentMiddleware } from "clawql-payments/x402";
import { attachPaymentsWellKnownRoutes } from "clawql-payments/discovery";
import { attachMppOpenApiRoutes, isMppOpenApiEnabled } from "clawql-payments/mpp";
import { createInferenceGateway, createInferenceGatewayAsync } from "../gateway.js";
import type { InferenceGateway } from "../gateway.js";
import { createProviderRegistry } from "../providers/registry.js";
import { composeDefaultProviderPlugins } from "../plugin/compose.js";
import type { ProviderRegistry } from "../providers/types.js";
import { createVirtualKeyAuthMiddleware } from "./auth.js";
import { createOpenAiCompatRouter } from "./openai-compat.js";
import { createDecisionRouter } from "../decision/router.js";
import { createMemoryRouter } from "../memory/router.js";
import { createEventsRouter } from "../events/router.js";
import { maybeInitInferenceOtelTracing } from "../observability/otel-tracing.js";
import { createInferenceStore } from "../store/create.js";
import type { InferenceStore } from "../store/types.js";
import { registerInferencePoolShutdownHooks } from "../store/postgres-pool.js";
import { resolveInferenceEffectiveEnv } from "../policy/manifest.js";
import { keysEnforcementActive } from "../keys/store.js";
import { Effect } from "effect";

export type CreateInferenceHttpAppOptions = {
  gateway?: InferenceGateway;
  registry?: ProviderRegistry;
  env?: NodeJS.ProcessEnv;
  /** Override inference call store (defaults from CLAWQL_INFERENCE_STORE*). */
  store?: InferenceStore | null;
};

export function createInferenceHttpApp(options: CreateInferenceHttpAppOptions = {}): Express {
  const env = resolveInferenceEffectiveEnv(options.env ?? process.env);
  const registry =
    options.registry ??
    createProviderRegistry({
      env,
      plugins: composeDefaultProviderPlugins(),
    });
  const gateway = options.gateway ?? createInferenceGateway({ env, providers: registry });
  const store = options.store === undefined ? createInferenceStore({ env }) : options.store;
  const app = express();
  app.use((req, res, next) => {
    if (req.method === "POST" && req.path.startsWith("/events/inbound")) {
      express.raw({ type: "*/*", limit: "256kb" })(req, res, next);
      return;
    }
    express.json({ limit: "2mb" })(req, res, next);
  });
  app.get("/healthz", (_req, res) => {
    res.json({ status: "ok", service: "clawql-inference" });
  });
  app.get("/v1", (_req, res) => {
    res.json({
      object: "clawql-inference",
      openai_compatible: true,
      endpoints: [
        "/v1/chat/completions",
        "/v1/models",
        "/v1/systemone",
        "/v1/decisions",
        "/decision",
        "/decision/eval",
        "/v1/decisions/eval",
        "/decision/flip-rate",
        "/v1/decisions/flip-rate",
        "/memory",
        "/events",
      ],
      ladder: ["/v1", "/mcp", "/memory", "/decision", "/events"],
    });
  });
  attachPaymentsWellKnownRoutes(app, { serverName: "ClawQL Inference" });
  if (isMppOpenApiEnabled(env)) {
    attachMppOpenApiRoutes(app, { serverName: "ClawQL Inference", env });
  }
  app.use(createX402PaymentMiddleware({ env }));
  app.use(createVirtualKeyAuthMiddleware({ env }));
  // Pass store explicitly so tool-calling passthrough (OpenBench / OpenCode) still records.
  app.use(createOpenAiCompatRouter({ gateway, registry, env, store }));
  app.use(createDecisionRouter({ env }));
  app.use(createMemoryRouter({ env }));
  app.use(createEventsRouter({ env }));
  return app;
}

export function resolveInferencePort(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.CLAWQL_INFERENCE_PORT?.trim() || env.PORT?.trim() || "8080";
  const port = Number.parseInt(raw, 10);
  if (!Number.isFinite(port) || port <= 0) {
    throw new Error(`Invalid inference port: ${raw}`);
  }
  return port;
}

export function resolveInferenceHost(env: NodeJS.ProcessEnv = process.env): string {
  // Audit 6.03: default loopback (was 0.0.0.0).
  return env.CLAWQL_INFERENCE_HOST?.trim() || "127.0.0.1";
}

function isLoopbackBindHost(host: string): boolean {
  const h = host.trim().toLowerCase();
  return h === "127.0.0.1" || h === "localhost" || h === "::1" || h === "[::1]";
}

function envFlagOn(env: NodeJS.ProcessEnv, key: string): boolean {
  const v = env[key]?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

/**
 * Audit 6.03: refuse unauthenticated non-loopback binds unless explicitly allowed.
 * Regulated tier always requires virtual-key enforcement.
 */
export function assertInferenceBindAuthPolicy(
  host: string,
  env: NodeJS.ProcessEnv = process.env
): void {
  const regulated = env.CLAWQL_TIER?.trim().toLowerCase() === "regulated";
  const keysOn = keysEnforcementActive(env);
  if (regulated && !keysOn) {
    throw new Error(
      "CLAWQL_TIER=regulated requires inference virtual-key enforcement " +
        "(create a key or set CLAWQL_INFERENCE_KEYS_ENABLED=1)"
    );
  }
  if (!isLoopbackBindHost(host) && !keysOn) {
    if (regulated || !envFlagOn(env, "CLAWQL_INFERENCE_ALLOW_UNAUTHENTICATED")) {
      throw new Error(
        `Refusing unauthenticated inference bind on ${host}: ` +
          "set CLAWQL_INFERENCE_HOST=127.0.0.1, enable virtual keys, " +
          "or set CLAWQL_INFERENCE_ALLOW_UNAUTHENTICATED=1 (non-regulated only)"
      );
    }
  }
}

async function runInferenceHttpServerImpl(
  options: {
    gateway?: InferenceGateway;
    env?: NodeJS.ProcessEnv;
    port?: number;
    host?: string;
  } = {}
): Promise<{ app: Express; port: number; host: string }> {
  const env = resolveInferenceEffectiveEnv(options.env ?? process.env);
  registerInferencePoolShutdownHooks();
  await maybeInitInferenceOtelTracing(env);
  const registry = createProviderRegistry({
    env,
    plugins: composeDefaultProviderPlugins(),
  });
  const gateway =
    options.gateway ?? (await createInferenceGatewayAsync({ env, providers: registry }));
  const app = createInferenceHttpApp({ gateway, registry, env });
  const port = options.port ?? resolveInferencePort(env);
  const host = options.host ?? resolveInferenceHost(env);
  assertInferenceBindAuthPolicy(host, env);
  await new Promise<void>((resolve) => {
    app.listen(port, host, () => resolve());
  });
  return { app, port, host };
}

export function runInferenceHttpServerEffect(
  options: {
    gateway?: InferenceGateway;
    env?: NodeJS.ProcessEnv;
    port?: number;
    host?: string;
  } = {}
): Effect.Effect<{ app: Express; port: number; host: string }, Error> {
  return Effect.tryPromise({
    try: () => runInferenceHttpServerImpl(options),
    catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
  });
}

/** Promise façade — prefer {@link runInferenceHttpServerEffect} for Effect callers. */
export async function runInferenceHttpServer(
  options: {
    gateway?: InferenceGateway;
    env?: NodeJS.ProcessEnv;
    port?: number;
    host?: string;
  } = {}
): Promise<{ app: Express; port: number; host: string }> {
  return Effect.runPromise(runInferenceHttpServerEffect(options));
}
