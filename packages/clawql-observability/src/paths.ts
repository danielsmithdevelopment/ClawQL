import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { Effect } from "effect";

import { ObservabilityError } from "./errors.js";
import type { LgtmPlusLocalEndpoints } from "./types.js";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));

export const packagePaths = {
  root: packageRoot,
  alloyConfig: join(packageRoot, "alloy", "config.river"),
  helmValues: join(packageRoot, "helm", "values.yaml"),
  helmSecurityOverlay: join(packageRoot, "helm", "security-overlay.yaml"),
  dockerCompose: join(packageRoot, "docker", "docker-compose.yaml"),
  dockerComposeSecurity: join(packageRoot, "docker", "docker-compose.security.yaml"),
  dashboards: join(packageRoot, "dashboards", "default-grafana-dashboards.json"),
  alerts: join(packageRoot, "alerts", "default-alert-rules.yaml"),
} as const;

/** Default service URLs when running `npm run compose:up` locally. */
export const defaultLocalEndpoints = (): LgtmPlusLocalEndpoints => ({
  grafanaUrl: "http://localhost:3000",
  alloyOtlpGrpc: "localhost:4317",
  alloyOtlpHttp: "http://localhost:4318",
  lokiPushUrl: "http://localhost:3100/loki/api/v1/push",
  tempoOtlpHttp: "http://localhost:3200",
  mimirPrometheusUrl: "http://localhost:9009/prometheus",
  pyroscopeUrl: "http://localhost:4040",
});

export const resolvePackagePathEffect = (
  key: keyof typeof packagePaths
): Effect.Effect<string, ObservabilityError> => Effect.sync(() => packagePaths[key]);

export const resolvePackagePath = (key: keyof typeof packagePaths): string =>
  Effect.runSync(resolvePackagePathEffect(key));
