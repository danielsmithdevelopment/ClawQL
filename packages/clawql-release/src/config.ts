import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ReleaseConfigV1 } from "./types.js";

export const DEFAULT_RELEASE_CONFIG: ReleaseConfigV1 = {
  version: 1,
  outputDir: "releases",
  repository: "danielsmithdevelopment/ClawQL",
  images: {
    "clawql-mcp": "ghcr.io/danielsmithdevelopment/clawql-mcp",
    "clawql-dashboard": "ghcr.io/danielsmithdevelopment/clawql-dashboard",
    "clawql-website": "ghcr.io/danielsmithdevelopment/clawql-website",
    "clawql-panguard-mcp-bridge": "ghcr.io/danielsmithdevelopment/clawql-panguard-mcp-bridge",
  },
};

export function releaseConfigPath(rootDir: string): string {
  return join(rootDir, ".clawql", "release.json");
}

export async function readReleaseConfig(rootDir: string): Promise<ReleaseConfigV1> {
  const path = releaseConfigPath(rootDir);
  try {
    const raw = await readFile(path, "utf8");
    const parsed = JSON.parse(raw) as Partial<ReleaseConfigV1>;
    return {
      ...DEFAULT_RELEASE_CONFIG,
      ...parsed,
      images: { ...DEFAULT_RELEASE_CONFIG.images, ...(parsed.images ?? {}) },
    };
  } catch (e: unknown) {
    const code = (e as NodeJS.ErrnoException)?.code;
    if (code === "ENOENT") return { ...DEFAULT_RELEASE_CONFIG };
    throw e;
  }
}

export async function writeReleaseConfig(rootDir: string, config?: ReleaseConfigV1): Promise<string> {
  const path = releaseConfigPath(rootDir);
  await mkdir(join(rootDir, ".clawql"), { recursive: true });
  const out = config ?? DEFAULT_RELEASE_CONFIG;
  await writeFile(path, `${JSON.stringify(out, null, 2)}\n`, "utf8");
  return path;
}
