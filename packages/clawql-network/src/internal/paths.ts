import { createRequire } from "node:module";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

const require = createRequire(import.meta.url);

export const CLAWQL_HOME_ENV = "CLAWQL_HOME";
export const NETWORK_STATE_VERSION = 1 as const;

export function defaultClawqlHome(): string {
  const raw = process.env[CLAWQL_HOME_ENV]?.trim();
  if (raw) return resolve(raw);
  return resolve(homedir(), ".ClawQL");
}

export function networkRoot(home = defaultClawqlHome()): string {
  return join(home, "network");
}

export function networkStatePath(home = defaultClawqlHome()): string {
  return join(networkRoot(home), "network.json");
}

export function headscaleDir(home = defaultClawqlHome()): string {
  return join(networkRoot(home), "headscale");
}

export function headscaleConfigPath(home = defaultClawqlHome()): string {
  return join(headscaleDir(home), "config.yaml");
}

export function tailcatBinDir(): string {
  const fromEnv = process.env.CLAWQL_TAILCAT_BIN_DIR?.trim();
  if (fromEnv) return fromEnv;
  try {
    const pkgRoot = dirname(require.resolve("clawql-network/package.json"));
    return join(pkgRoot, "tailcat/bin");
  } catch {
    return join(process.cwd(), "packages/clawql-network/tailcat/bin");
  }
}
