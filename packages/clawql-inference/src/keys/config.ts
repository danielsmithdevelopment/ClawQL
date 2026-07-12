import { join } from "node:path";
import type { KeysConfig } from "./types.js";

const FILE_NAME = "virtual-keys.json";

function parseTruthy(value: string | undefined): boolean {
  if (value === undefined) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

export function resolveVirtualKeysPath(env: NodeJS.ProcessEnv = process.env): string {
  const home = env.CLAWQL_HOME?.trim() || join(process.cwd(), ".clawql");
  return join(home, "Inference", FILE_NAME);
}

export function loadKeysConfig(env: NodeJS.ProcessEnv = process.env): KeysConfig {
  return {
    enabled: parseTruthy(env.CLAWQL_INFERENCE_KEYS_ENABLED),
  };
}
