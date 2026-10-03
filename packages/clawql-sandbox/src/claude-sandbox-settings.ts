import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname } from "node:path";
import { Effect } from "effect";
import type { SandboxContainmentConfig } from "./seatbelt-config.js";
import { dedupePaths } from "./seatbelt-config.js";

export type ClaudeSandboxSettings = {
  sandbox: {
    enabled: boolean;
    allowedPaths: string[];
    deniedPaths: string[];
  };
};

function toTildePath(absOrTilde: string): string {
  const home = homedir();
  return absOrTilde.startsWith(home) ? `~${absOrTilde.slice(home.length)}` : absOrTilde;
}

/** Claude Code native sandbox — defense in depth under ClawQL's outer Seatbelt wrapper. */
export function claudeSandboxSettingsFromConfig(
  config: SandboxContainmentConfig,
  workDir: string
): ClaudeSandboxSettings {
  const clawqlPath = config.clawqlHome ? toTildePath(config.clawqlHome) : "~/.ClawQL";
  return {
    sandbox: {
      enabled: true,
      allowedPaths: dedupePaths([clawqlPath, toTildePath(workDir), ...config.allowedPaths]),
      deniedPaths: [...config.deniedPaths],
    },
  };
}

/** Merge Claude Code sandbox settings from containment config (Effect-primary). */
export function writeClaudeSandboxSettingsEffect(
  config: SandboxContainmentConfig,
  settingsPath: string,
  workDir: string
): Effect.Effect<void, Error> {
  return Effect.tryPromise({
    try: async () => {
      await mkdir(dirname(settingsPath), { recursive: true, mode: 0o700 });

      let existing: Record<string, unknown> = {};
      try {
        existing = JSON.parse(await readFile(settingsPath, "utf8")) as Record<string, unknown>;
        await copyFile(settingsPath, `${settingsPath}.bak-${Date.now()}`);
      } catch (e: unknown) {
        if (!(e && typeof e === "object" && "code" in e && e.code === "ENOENT")) throw e;
      }

      const clawqlBlock = claudeSandboxSettingsFromConfig(config, workDir);
      const out = { ...existing, ...clawqlBlock };

      await writeFile(settingsPath, `${JSON.stringify(out, null, 2)}\n`, {
        encoding: "utf8",
        mode: 0o600,
      });
    },
    catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
  });
}

/** Promise façade for CLI / hosts that still await Claude settings writes. */
export async function writeClaudeSandboxSettings(
  config: SandboxContainmentConfig,
  settingsPath: string,
  workDir: string
): Promise<void> {
  return Effect.runPromise(writeClaudeSandboxSettingsEffect(config, settingsPath, workDir));
}
