import { mkdir, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { commandExists, isDryRun, runCommand } from "../exec.js";
import type { CollaborationRecord } from "../types.js";
import { readReleaseConfig } from "../config.js";

export type CollaborationSyncResult = {
  collaboration: CollaborationRecord;
  detail: string[];
};

/**
 * Radicle is the primary git surface; GitHub is a read-only mirror with a
 * banner pointing at the permanent Arweave release when available.
 */
export async function syncCollaborationRemotes(opts: {
  rootDir: string;
  arweaveTxId?: string;
  dryRun?: boolean;
}): Promise<CollaborationSyncResult> {
  const config = await readReleaseConfig(opts.rootDir);
  const dry = isDryRun(opts.dryRun);
  const detail: string[] = [];
  const primary = config.collaboration?.primary ?? "radicle";

  const collaboration: CollaborationRecord = {
    primary,
    radicle: {
      rid: config.collaboration?.radicleRid,
      remote: "rad",
    },
    githubMirror: {
      url:
        config.collaboration?.githubMirrorUrl ??
        (config.repository ? `https://github.com/${config.repository}` : undefined),
      bannerUpdated: false,
      arweaveTxId: opts.arweaveTxId,
    },
  };

  if (primary === "radicle" || config.collaboration?.radicleRid) {
    if (!dry && commandExists("rad")) {
      const id = runCommand("rad", ["self", "--rid"], { cwd: opts.rootDir, allowFailure: true });
      if (id.status === 0 && id.stdout) {
        collaboration.radicle = {
          ...collaboration.radicle,
          rid: id.stdout.trim() || collaboration.radicle?.rid,
          identity: runCommand("rad", ["self", "--did"], {
            cwd: opts.rootDir,
            allowFailure: true,
          }).stdout.trim() || undefined,
        };
      }
      const push = runCommand("rad", ["push"], { cwd: opts.rootDir, allowFailure: true });
      detail.push(
        push.status === 0 ? "rad push ok" : `rad push skipped/failed: ${push.stderr || push.stdout}`
      );
    } else {
      detail.push(
        dry
          ? "dry-run: skipped rad push"
          : "rad CLI not found — recorded Radicle as primary in manifest; install radicle to push"
      );
    }
  }

  // GitHub mirror: ensure origin exists and write banner fragment for README/release notes
  if (collaboration.githubMirror?.url || config.repository) {
    const bannerDir = join(opts.rootDir, ".clawql", "github-mirror");
    await mkdir(bannerDir, { recursive: true });
    const tx = opts.arweaveTxId;
    const banner = [
      "<!-- clawql-immutable-release-banner -->",
      "> **Canonical release:** this GitHub repository is a **read-only mirror**.",
      tx
        ? `> Verify the permanent release on Arweave: \`${tx}\` (via ar.io / \`clawql-release verify ${tx}\`).`
        : "> Publish with `clawql-release publish --permanent` to anchor the canonical Arweave transaction.",
      "> Primary collaboration surface: **Radicle** (see `.clawql/release.json`).",
      "",
    ].join("\n");
    await writeFile(join(bannerDir, "BANNER.md"), banner, "utf8");
    collaboration.githubMirror = {
      ...collaboration.githubMirror,
      bannerUpdated: true,
      arweaveTxId: tx,
    };
    detail.push(`wrote GitHub mirror banner at ${join(bannerDir, "BANNER.md")}`);

    // Optional: attach note to an existing GitHub release via gh
    if (!dry && tx && commandExists("gh")) {
      const note = `Canonical Arweave tx: ${tx}`;
      runCommand("gh", ["release", "edit", "--notes-file", join(bannerDir, "BANNER.md")], {
        cwd: opts.rootDir,
        allowFailure: true,
      });
      detail.push(`attempted gh release note update (${note})`);
    }
  }

  await writeFile(
    join(opts.rootDir, ".clawql", "collaboration.json"),
    `${JSON.stringify({ collaboration, detail, syncedAt: new Date().toISOString() }, null, 2)}\n`,
    "utf8"
  );

  return { collaboration, detail };
}

export async function readCollaborationState(
  rootDir: string
): Promise<CollaborationRecord | undefined> {
  try {
    const raw = await readFile(join(rootDir, ".clawql", "collaboration.json"), "utf8");
    const parsed = JSON.parse(raw) as { collaboration?: CollaborationRecord };
    return parsed.collaboration;
  } catch {
    return undefined;
  }
}
