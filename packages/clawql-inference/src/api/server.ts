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
import { maybeInitInferenceOtelTracing } from "../observability/otel-tracing.js";
import { registerInferencePoolShutdownHooks } from "../store/postgres-pool.js";
import { resolveInferenceEffectiveEnv } from "../policy/manifest.js";

export type CreateInferenceHttpAppOptions = {
  gateway?: InferenceGateway;
  registry?: ProviderRegistry;
  env?: NodeJS.ProcessEnv;
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
  const app = express();
  app.use(express.json({ limit: "2mb" }));
  app.get("/healthz", (_req, res) => {
    res.json({ status: "ok", service: "clawql-inference" });
  });
  app.get("/v1", (_req, res) => {
    res.json({
      object: "clawql-inference",
      openai_compatible: true,
      endpoints: ["/v1/chat/completions", "/v1/models"],
    });
  });
  attachPaymentsWellKnownRoutes(app, { serverName: "ClawQL Inference" });
  if (isMppOpenApiEnabled(env)) {
    attachMppOpenApiRoutes(app, { serverName: "ClawQL Inference", env });
  }
  app.use(createX402PaymentMiddleware({ env }));
  app.use(createVirtualKeyAuthMiddleware({ env }));
  app.use(createOpenAiCompatRouter({ gateway, registry, env }));
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
  return env.CLAWQL_INFERENCE_HOST?.trim() || "0.0.0.0";
}

export async function runInferenceHttpServer(
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
  await new Promise<void>((resolve) => {
    app.listen(port, host, () => resolve());
  });
  return { app, port, host };
}
