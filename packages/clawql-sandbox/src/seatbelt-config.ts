import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { z } from "zod";
import { resolveSandboxPath } from "./seatbelt-paths.js";

export const SANDBOX_CONFIG_VERSION = 1;

/** Agent harnesses wrapped by `clawql <harness>`. */
export const SANDBOX_HARNESS_IDS = ["claude", "codex", "cursor", "opencode"] as const;
export type SandboxHarnessId = (typeof SANDBOX_HARNESS_IDS)[number];

export const DEFAULT_DENIED_PATHS = [
  "~/.ssh",
  "~/Documents",
  "~/Desktop",
  "~/Downloads",
  "~/.aws",
  "~/.config",
  "~/.gnupg",
  "~/.kube",
] as const;

export const DEFAULT_ALLOWED_PATHS = ["~/company-work/cloned-repos"] as const;

const SandboxContainmentConfigSchema = z.object({
  version: z.literal(SANDBOX_CONFIG_VERSION),
  enabled: z.boolean(),
  failClosed: z.boolean(),
  backend: z.literal("macos-seatbelt"),
  allowedPaths: z.array(z.string().min(1)),
  deniedPaths: z.array(z.string().min(1)),
  clawqlHome: z.string().min(1).optional(),
  workDir: z.string().min(1).optional(),
  lastVerifiedAt: z.string().datetime().optional(),
  lastVerifyOk: z.boolean().optional(),
});

export type SandboxContainmentConfig = z.infer<typeof SandboxContainmentConfigSchema>;

export type SandboxPaths = {
  home: string;
  sandboxDir: string;
  configPath: string;
  execProfilePath: string;
  wrapperPath: string;
  verifyResultPath: string;
  claudeSettingsPath: string;
  harnessProfilePath: (harness: SandboxHarnessId) => string;
};

export function defaultClawqlHome(home = homedir()): string {
  return resolveSandboxPath("~/.ClawQL", home);
}

export function sandboxPaths(clawqlHome = defaultClawqlHome()): SandboxPaths {
  const sandboxDir = join(clawqlHome, "sandbox");
  return {
    home: clawqlHome,
    sandboxDir,
    configPath: join(sandboxDir, "config.json"),
    execProfilePath: join(sandboxDir, "clawql-exec.sb"),
    wrapperPath: join(sandboxDir, "clawql-safe"),
    verifyResultPath: join(sandboxDir, "verify-last.json"),
    claudeSettingsPath: join(homedir(), ".claude", "settings.json"),
    harnessProfilePath: (harness: SandboxHarnessId) => join(sandboxDir, `${harness}.sb`),
  };
}

export function isSandboxHarnessId(raw: string): raw is SandboxHarnessId {
  return (SANDBOX_HARNESS_IDS as readonly string[]).includes(raw);
}

export function defaultContainmentConfig(
  opts: {
    clawqlHome?: string;
    workDir?: string;
    allowedPaths?: string[];
    deniedPaths?: string[];
  } = {}
): SandboxContainmentConfig {
  const clawqlHome = opts.clawqlHome ?? defaultClawqlHome();
  const allowed = opts.allowedPaths?.length
    ? opts.allowedPaths
    : [...DEFAULT_ALLOWED_PATHS, clawqlHome];
  return {
    version: SANDBOX_CONFIG_VERSION,
    enabled: true,
    failClosed: true,
    backend: "macos-seatbelt",
    allowedPaths: dedupePaths(allowed),
    deniedPaths: dedupePaths([...DEFAULT_DENIED_PATHS]),
    clawqlHome,
    workDir: opts.workDir,
  };
}

export function dedupePaths(paths: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of paths) {
    const key = p.trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

export function resolvedAllowedPaths(config: SandboxContainmentConfig, home = homedir()): string[] {
  return dedupePaths(config.allowedPaths).map((p) => resolveSandboxPath(p, home));
}

export function resolvedDeniedPaths(config: SandboxContainmentConfig, home = homedir()): string[] {
  return dedupePaths(config.deniedPaths).map((p) => resolveSandboxPath(p, home));
}

/** Seatbelt `-D` parameters for parameterized harness profiles. */
export function seatbeltProfileParams(
  config: SandboxContainmentConfig,
  workDir: string,
  home = homedir()
): Record<string, string> {
  const clawqlDir = config.clawqlHome ?? defaultClawqlHome(home);
  return {
    WORK_DIR: resolve(workDir),
    CLAWQL_DIR: resolve(clawqlDir),
    HOME_SSH: join(home, ".ssh"),
    HOME_AWS: join(home, ".aws"),
    HOME_CONFIG: join(home, ".config"),
  };
}

export async function loadContainmentConfig(
  clawqlHome = defaultClawqlHome()
): Promise<SandboxContainmentConfig | null> {
  const { configPath } = sandboxPaths(clawqlHome);
  try {
    const raw = await readFile(configPath, "utf8");
    return SandboxContainmentConfigSchema.parse(JSON.parse(raw));
  } catch (e: unknown) {
    if (e && typeof e === "object" && "code" in e && e.code === "ENOENT") return null;
    throw e;
  }
}

export async function saveContainmentConfig(
  config: SandboxContainmentConfig,
  clawqlHome = defaultClawqlHome()
): Promise<SandboxPaths> {
  const paths = sandboxPaths(clawqlHome);
  await mkdir(paths.sandboxDir, { recursive: true, mode: 0o700 });
  await writeFile(paths.configPath, `${JSON.stringify(config, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  return paths;
}
