import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ReleaseConfigV1 } from "./types.js";
import { enableSignedCommitsByDefault } from "./sign.js";
import { ensureWorkspacesGitignore } from "./workspace/index.js";
import { Effect } from "effect";

export const DEFAULT_RELEASE_CONFIG: ReleaseConfigV1 = {
  version: 1,
  outputDir: "releases",
  repository: "danielsmithdevelopment/ClawQL",
  requireSignedCommits: true,
  workspaceBackend: "git-worktree",
  images: {
    "clawql-mcp": "ghcr.io/danielsmithdevelopment/clawql-mcp",
    "clawql-dashboard": "ghcr.io/danielsmithdevelopment/clawql-dashboard",
    "clawql-website": "ghcr.io/danielsmithdevelopment/clawql-website",
    "clawql-panguard-mcp-bridge": "ghcr.io/danielsmithdevelopment/clawql-panguard-mcp-bridge",
  },
  collaboration: {
    primary: "radicle",
    githubMirrorUrl: "https://github.com/danielsmithdevelopment/ClawQL",
  },
  permanence: {
    arweaveGateway: "https://arweave.net",
    dryRun: true,
  },
  access: {
    defaultPrice: "0.50 USDC",
    asset: "USDC",
    network: "base-sepolia",
  },
};

export function releaseConfigPath(rootDir: string): string {
  return join(rootDir, ".clawql", "release.json");
}

async function readReleaseConfigImpl(rootDir: string): Promise<ReleaseConfigV1> {
  const path = releaseConfigPath(rootDir);
  try {
    const raw = await readFile(path, "utf8");
    const parsed = JSON.parse(raw) as Partial<ReleaseConfigV1>;
    return {
      ...DEFAULT_RELEASE_CONFIG,
      ...parsed,
      images: { ...DEFAULT_RELEASE_CONFIG.images, ...(parsed.images ?? {}) },
      collaboration: {
        ...DEFAULT_RELEASE_CONFIG.collaboration,
        ...(parsed.collaboration ?? {}),
      },
      permanence: {
        ...DEFAULT_RELEASE_CONFIG.permanence,
        ...(parsed.permanence ?? {}),
      },
      access: {
        ...DEFAULT_RELEASE_CONFIG.access,
        ...(parsed.access ?? {}),
      },
    };
  } catch (e: unknown) {
    const code = (e as NodeJS.ErrnoException)?.code;
    if (code === "ENOENT") return { ...DEFAULT_RELEASE_CONFIG };
    throw e;
  }
}

export type InitReleaseOptions = {
  /** Skip git signing setup (tests). */
  skipSigningSetup?: boolean;
};

async function writeReleaseConfigImpl(
  rootDir: string,
  config?: ReleaseConfigV1,
  options: InitReleaseOptions = {}
): Promise<string> {
  const path = releaseConfigPath(rootDir);
  await mkdir(join(rootDir, ".clawql"), { recursive: true });
  const out = config ?? DEFAULT_RELEASE_CONFIG;
  await writeFile(path, `${JSON.stringify(out, null, 2)}\n`, "utf8");
  await writeFile(
    join(rootDir, ".clawql", ".gitignore"),
    [
      "keys/",
      "escrow/",
      "workspaces/git-worktree/",
      "ipfs-staging/",
      "arweave/",
      "tmp/",
      "pulled/",
      "verify-cache/",
      "golden-image/",
      "collaboration.json",
      "",
    ].join("\n"),
    "utf8"
  );
  await ensureWorkspacesGitignore(rootDir);

  if (!options.skipSigningSetup && out.requireSignedCommits !== false) {
    try {
      await enableSignedCommitsByDefault(rootDir);
    } catch {
      // non-fatal on init
    }
  }

  return path;
}

function fsError(cause: unknown): Error {
  return cause instanceof Error ? cause : new Error(String(cause));
}

/** Read merged release config (Effect-primary). Missing file → defaults. */
export function readReleaseConfigEffect(rootDir: string): Effect.Effect<ReleaseConfigV1, Error> {
  return Effect.tryPromise({ try: () => readReleaseConfigImpl(rootDir), catch: fsError });
}

/** Promise façade for callers that still await release config reads. */
export async function readReleaseConfig(rootDir: string): Promise<ReleaseConfigV1> {
  return Effect.runPromise(readReleaseConfigEffect(rootDir));
}

/** Write release config + clawql gitignore scaffolding (Effect-primary). */
export function writeReleaseConfigEffect(
  rootDir: string,
  config?: ReleaseConfigV1,
  options: InitReleaseOptions = {}
): Effect.Effect<string, Error> {
  return Effect.tryPromise({
    try: () => writeReleaseConfigImpl(rootDir, config, options),
    catch: fsError,
  });
}

/** Promise façade for callers that still await release config writes. */
export async function writeReleaseConfig(
  rootDir: string,
  config?: ReleaseConfigV1,
  options: InitReleaseOptions = {}
): Promise<string> {
  return Effect.runPromise(writeReleaseConfigEffect(rootDir, config, options));
}
