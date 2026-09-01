import { Effect } from "effect";

import { packagePaths } from "../paths.js";

const envTruthy = (value: string | undefined): boolean => {
  const trimmed = value?.trim().toLowerCase();
  return trimmed === "1" || trimmed === "true" || trimmed === "yes";
};

export type ObservabilityHostConfig = {
  readonly healthIntervalMs: number;
  readonly alloyAutoApply: boolean;
  readonly alloyOutputPath: string;
  readonly httpApiKey?: string;
};

/** Read host integration config from env. */
export const readObservabilityHostConfigEffect = (
  env: NodeJS.ProcessEnv = process.env
): Effect.Effect<ObservabilityHostConfig> =>
  Effect.sync(() => {
    const intervalRaw = env.CLAWQL_OBSERVABILITY_HEALTH_INTERVAL_MS?.trim();
    const parsedInterval = intervalRaw ? Number.parseInt(intervalRaw, 10) : Number.NaN;
    const healthIntervalMs =
      Number.isFinite(parsedInterval) && parsedInterval > 0 ? parsedInterval : 60_000;

    const apiKey = env.CLAWQL_OBSERVABILITY_API_KEY?.trim();

    return {
      healthIntervalMs,
      alloyAutoApply: envTruthy(env.CLAWQL_OBSERVABILITY_ALLOY_AUTO_APPLY),
      alloyOutputPath:
        env.CLAWQL_OBSERVABILITY_ALLOY_OUTPUT_PATH?.trim() || packagePaths.alloyConfig,
      httpApiKey: apiKey || undefined,
    };
  });
