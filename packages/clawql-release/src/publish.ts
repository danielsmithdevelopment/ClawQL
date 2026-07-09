import { spawnSync } from "node:child_process";
import { buildReleaseManifest } from "./manifest.js";
import type { PublishOptions } from "./types.js";

export type PublishResult = {
  manifestPath: string;
  bundleDir: string;
  githubReleaseUrl?: string;
};

export async function publishRelease(options: PublishOptions): Promise<PublishResult> {
  const { manifest, bundleDir, manifestPath } = await buildReleaseManifest({
    ...options,
    copyArtifacts: options.copyArtifacts !== false,
  });

  let githubReleaseUrl: string | undefined;
  if (options.githubRelease) {
    githubReleaseUrl = attachGitHubRelease(
      options.rootDir,
      manifest.tag,
      manifestPath,
      manifest.merkleRoot
    );
  }

  return { manifestPath, bundleDir, githubReleaseUrl };
}

function attachGitHubRelease(
  rootDir: string,
  tag: string,
  manifestPath: string,
  merkleRoot: string
): string | undefined {
  if (!commandExists("gh")) {
    console.error("[clawql-release] gh CLI not found — skip GitHub Release attach");
    return undefined;
  }

  const viewExisting = spawnSync("gh", ["release", "view", tag], {
    cwd: rootDir,
    encoding: "utf8",
    stdio: "pipe",
  });

  if (viewExisting.status !== 0) {
    const createRel = spawnSync(
      "gh",
      [
        "release",
        "create",
        tag,
        "--title",
        `ClawQL ${tag}`,
        "--notes",
        `Immutable release manifest (Layer 0 MVP).\n\nMerkle root: \`${merkleRoot}\``,
      ],
      { cwd: rootDir, encoding: "utf8", stdio: "pipe" }
    );
    if (createRel.status !== 0) {
      console.error(
        "[clawql-release] gh release create failed:",
        createRel.stderr || createRel.stdout
      );
      return undefined;
    }
  }

  const upload = spawnSync("gh", ["release", "upload", tag, manifestPath, "--clobber"], {
    cwd: rootDir,
    encoding: "utf8",
    stdio: "pipe",
  });
  if (upload.status !== 0) {
    console.error("[clawql-release] gh release upload failed:", upload.stderr || upload.stdout);
  }

  const view = spawnSync("gh", ["release", "view", tag, "--json", "url", "-q", ".url"], {
    cwd: rootDir,
    encoding: "utf8",
  });
  return view.stdout?.trim() || undefined;
}

function commandExists(cmd: string): boolean {
  const r = spawnSync("which", [cmd], { encoding: "utf8" });
  return r.status === 0;
}
