import { access } from "node:fs/promises";
import { constants } from "node:fs";
import { join } from "node:path";

import { Effect } from "effect";

import { NetworkBinaryNotFoundError } from "../errors.js";
import { commandAvailable } from "../internal/subprocess.js";
import { tailcatBinDir } from "../internal/paths.js";

export type TailcatBinary = {
  readonly command: string;
  readonly argsPrefix: readonly string[];
};

const PLATFORM_BIN_NAMES: Record<string, string> = {
  "linux-x64": "tailcat-linux-amd64",
  "linux-arm64": "tailcat-linux-arm64",
  "darwin-arm64": "tailcat-darwin-arm64",
  "win32-x64": "tailcat-windows-amd64.exe",
};

function platformKey(): string {
  const arch = process.arch === "x64" ? "x64" : process.arch;
  return `${process.platform}-${arch}`;
}

const isExecutable = (path: string): Effect.Effect<boolean, never> =>
  Effect.promise(async () => {
    try {
      await access(path, constants.X_OK);
      return true;
    } catch {
      return false;
    }
  });

/** Resolve tailcat binary: env override → bundled platform binary → dev shim → PATH. */
export const resolveTailcatBinary = (): Effect.Effect<TailcatBinary, NetworkBinaryNotFoundError> =>
  Effect.gen(function* () {
    const envBin = process.env.CLAWQL_TAILCAT_BIN?.trim();
    if (envBin) {
      const ok = yield* isExecutable(envBin);
      if (ok) return { command: envBin, argsPrefix: [] };
    }

    const bundledName = PLATFORM_BIN_NAMES[platformKey()];
    if (bundledName) {
      const bundledPath = join(tailcatBinDir(), bundledName);
      const bundledOk = yield* isExecutable(bundledPath);
      if (bundledOk) return { command: bundledPath, argsPrefix: [] };
    }

    const devShim = join(tailcatBinDir(), "tailcat-dev.mjs");
    const devOk = yield* Effect.promise(async () => {
      try {
        await access(devShim, constants.R_OK);
        return true;
      } catch {
        return false;
      }
    });
    if (devOk) {
      return { command: process.execPath, argsPrefix: [devShim] };
    }

    const onPath = yield* commandAvailable("tailcat");
    if (onPath) return { command: "tailcat", argsPrefix: [] };

    return yield* Effect.fail(
      new NetworkBinaryNotFoundError({
        binary: "tailcat",
        message:
          "tailcat binary not found — set CLAWQL_TAILCAT_BIN, run scripts/network/fetch-tailcat-binaries.mjs, or install tailcat on PATH",
      })
    );
  });
