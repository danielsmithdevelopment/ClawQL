import { Context, Layer } from "effect";
import {
  getClawqlAuditMaxEntries,
  getClawqlCacheMaxEntries,
  getClawqlCacheMaxValueBytes,
  isClawqlCuckooMetricsEnabled,
} from "./env.js";

export class ConfigService extends Context.Tag("clawql/ConfigService")<
  ConfigService,
  {
    readonly getAuditMaxEntries: () => number;
    readonly getCacheMaxValueBytes: () => number;
    readonly getCacheMaxEntries: () => number;
    readonly isCuckooMetricsEnabled: () => boolean;
  }
>() {}

export function configServiceFromEnv(env: NodeJS.ProcessEnv = process.env) {
  return ConfigService.of({
    getAuditMaxEntries: () => getClawqlAuditMaxEntries(env),
    getCacheMaxValueBytes: () => getClawqlCacheMaxValueBytes(env),
    getCacheMaxEntries: () => getClawqlCacheMaxEntries(env),
    isCuckooMetricsEnabled: () => isClawqlCuckooMetricsEnabled(env),
  });
}

/** Live config backed by `process.env` (re-read on each accessor for test-friendly overrides). */
export const ConfigLive = Layer.succeed(ConfigService, configServiceFromEnv());

/** Isolated config for tests with a custom env object. */
export function createConfigTestLayer(env: NodeJS.ProcessEnv): Layer.Layer<ConfigService> {
  return Layer.succeed(ConfigService, configServiceFromEnv(env));
}
