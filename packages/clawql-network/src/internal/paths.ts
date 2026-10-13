import { createRequire } from "node:module";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * `createRequire(import.meta.url)` throws when this file is loaded as CJS with a
 * missing `import.meta.url` (Vitest sometimes resolves dynamic `import("clawql-network")`
 * to `dist/index.cjs`). Fall back to cwd-relative resolve for that case.
 */
function tryCreateRequire(): NodeJS.Require | null {
  try {
    const metaUrl =
      typeof import.meta !== "undefined" && typeof import.meta.url === "string"
        ? import.meta.url
        : undefined;
    if (metaUrl) return createRequire(metaUrl);
  } catch {
    /* ignore */
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cjsFilename = typeof __filename !== "undefined" ? __filename : undefined;
    if (cjsFilename) return createRequire(cjsFilename);
  } catch {
    /* ignore */
  }
  return null;
}

const require = tryCreateRequire();

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
    if (require) {
      const pkgRoot = dirname(require.resolve("clawql-network/package.json"));
      return join(pkgRoot, "tailcat/bin");
    }
  } catch {
    /* fall through */
  }
  try {
    if (typeof import.meta !== "undefined" && import.meta.url) {
      // packages/clawql-network/src/internal → ../../ = package root (src) or dist-relative
      const here = dirname(fileURLToPath(import.meta.url));
      return join(here, "..", "..", "tailcat", "bin");
    }
  } catch {
    /* fall through */
  }
  return join(process.cwd(), "packages/clawql-network/tailcat/bin");
}
