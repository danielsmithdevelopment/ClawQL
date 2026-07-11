import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { expandTilde, resolveSandboxPath } from "./seatbelt-paths.js";

export const SANDBOX_CONFIG_VERSION = 1;

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
  lastVerifiedAt: z.string().datetime().optional(),
  lastVerifyOk: z.boolean().optional(),
});

export type SandboxContainmentConfig = z.infer<typeof SandboxContainmentConfigSchema>;

export type SandboxPaths = {
  home: string;
  sandboxDir: string;
  configPath: string;
  agentProfilePath: string;
  execProfilePath: string;
  wrapperPath: string;
  verifyResultPath: string;
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
    agentProfilePath: join(sandboxDir, "clawql-agent.sb"),
    execProfilePath: join(sandboxDir, "clawql-exec.sb"),
    wrapperPath: join(sandboxDir, "clawql-safe"),
    verifyResultPath: join(sandboxDir, "verify-last.json"),
  };
}

export function defaultContainmentConfig(
  opts: {
    clawqlHome?: string;
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
