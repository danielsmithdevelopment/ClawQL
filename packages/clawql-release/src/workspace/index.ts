import { mkdir, readFile, rm, writeFile, symlink, lstat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { runCommand, commandExists } from "../exec.js";
import { readGitHead } from "../git.js";
import type { SnapshotOptions, WorkspaceSnapshot, WorkspaceBackend } from "../types.js";

export type { SnapshotOptions, WorkspaceSnapshot, WorkspaceBackend };

function snapshotsMetaPath(rootDir: string): string {
  return join(rootDir, ".clawql", "workspaces", "snapshots.json");
}

type SnapshotStore = { snapshots: WorkspaceSnapshot[] };

async function loadStore(rootDir: string): Promise<SnapshotStore> {
  const path = snapshotsMetaPath(rootDir);
  try {
    const raw = await readFile(path, "utf8");
    return JSON.parse(raw) as SnapshotStore;
  } catch {
    return { snapshots: [] };
  }
}

async function saveStore(rootDir: string, store: SnapshotStore): Promise<void> {
  const path = snapshotsMetaPath(rootDir);
  await mkdir(join(rootDir, ".clawql", "workspaces"), { recursive: true });
  await writeFile(path, `${JSON.stringify(store, null, 2)}\n`, "utf8");
}

function newSnapshotId(backend: WorkspaceBackend, name: string): string {
  const slug = name.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 48);
  return `${backend}_${slug}_${Date.now().toString(36)}`;
}

export async function createGitWorktreeSnapshot(
  options: SnapshotOptions
): Promise<WorkspaceSnapshot> {
  const rootDir = resolve(options.rootDir);
  const worktreesRoot = join(rootDir, ".clawql", "workspaces", "git-worktree");
  await mkdir(worktreesRoot, { recursive: true });
  const path = join(worktreesRoot, options.name);
  const store = await loadStore(rootDir);
  const existing = store.snapshots.find(
    (s) => s.name === options.name && s.backend === "git-worktree"
  );
  if (existing) {
    return existing;
  }

  const branch = options.branch ?? `clawql/${options.name}`;
  const head = readGitHead(rootDir);

  // Create orphan branch tip at HEAD if needed, then worktree.
  runCommand("git", ["branch", branch, "HEAD"], { cwd: rootDir, allowFailure: true });
  const add = runCommand("git", ["worktree", "add", path, branch], {
    cwd: rootDir,
    allowFailure: true,
  });
  if (add.status !== 0) {
    // Retry with -B if branch exists elsewhere
    runCommand("git", ["worktree", "add", "-B", branch, path, "HEAD"], { cwd: rootDir });
  }

  const snap: WorkspaceSnapshot = {
    backend: "git-worktree",
    snapshotId: newSnapshotId("git-worktree", options.name),
    parentSnapshotId: options.parentSnapshotId,
    name: options.name,
    path,
    createdAt: new Date().toISOString(),
    commit: head.commit,
  };
  store.snapshots.push(snap);
  await saveStore(rootDir, store);
  return snap;
}

/**
 * Rift CoW backend. Uses `rift` CLI when available; otherwise creates a local
 * hardlink/copy workspace under `.rifts/` that still records parent ancestry
 * for manifest provenance (CI / developer machines without Rift).
 */
export async function createRiftSnapshot(options: SnapshotOptions): Promise<WorkspaceSnapshot> {
  const rootDir = resolve(options.rootDir);
  const store = await loadStore(rootDir);
  const existing = store.snapshots.find((s) => s.name === options.name && s.backend === "rift");
  if (existing) return existing;

  const riftsRoot = join(rootDir, ".rifts");
  await mkdir(riftsRoot, { recursive: true });
  const path = join(riftsRoot, options.name);
  const head = readGitHead(rootDir);

  if (commandExists("rift")) {
    runCommand("rift", ["create", "--name", options.name], { cwd: rootDir, allowFailure: true });
    // Prefer documented .rifts path; if CLI used another location, still record ours as canonical meta.
  } else {
    await mkdir(path, { recursive: true });
    // Lightweight CoW-ish marker: symlink to repo root content via pointer file.
    await writeFile(
      join(path, ".clawql-rift-snapshot.json"),
      `${JSON.stringify(
        {
          backend: "rift",
          mode: "local-fallback",
          parentSnapshotId: options.parentSnapshotId,
          commit: head.commit,
          createdAt: new Date().toISOString(),
          note: "rift CLI not found — local fallback workspace for provenance only",
        },
        null,
        2
      )}\n`,
      "utf8"
    );
    // Point SOURCE at the repo for agents that expect a checkout-like path.
    try {
      await symlink(rootDir, join(path, "SOURCE"));
    } catch {
      // ignore if exists
    }
  }

  const snap: WorkspaceSnapshot = {
    backend: "rift",
    snapshotId: newSnapshotId("rift", options.name),
    parentSnapshotId: options.parentSnapshotId,
    name: options.name,
    path,
    createdAt: new Date().toISOString(),
    commit: head.commit,
  };
  store.snapshots.push(snap);
  await saveStore(rootDir, store);
  return snap;
}

export async function createWorkspaceSnapshot(
  options: SnapshotOptions
): Promise<WorkspaceSnapshot> {
  switch (options.backend) {
    case "git-worktree":
      return createGitWorktreeSnapshot(options);
    case "rift":
      return createRiftSnapshot(options);
    case "cloudflare":
    case "ebs":
      throw new Error(
        `Backend ${options.backend} is reserved for cloud immutable volumes (not implemented in this release)`
      );
    default:
      throw new Error(`Unknown workspace backend: ${options.backend as string}`);
  }
}

export async function listWorkspaceSnapshots(rootDir: string): Promise<WorkspaceSnapshot[]> {
  const store = await loadStore(resolve(rootDir));
  return store.snapshots;
}

export async function removeWorkspaceSnapshot(
  rootDir: string,
  name: string
): Promise<WorkspaceSnapshot | undefined> {
  const root = resolve(rootDir);
  const store = await loadStore(root);
  const idx = store.snapshots.findIndex((s) => s.name === name);
  if (idx < 0) return undefined;
  const [snap] = store.snapshots.splice(idx, 1);
  if (!snap) return undefined;

  if (snap.backend === "git-worktree") {
    runCommand("git", ["worktree", "remove", "--force", snap.path], {
      cwd: root,
      allowFailure: true,
    });
  } else {
    try {
      const st = await lstat(snap.path);
      if (st.isDirectory()) await rm(snap.path, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
  await saveStore(root, store);
  return snap;
}

export async function resolveLatestSnapshot(
  rootDir: string,
  backend?: WorkspaceBackend
): Promise<WorkspaceSnapshot | undefined> {
  const snaps = await listWorkspaceSnapshots(rootDir);
  const filtered = backend ? snaps.filter((s) => s.backend === backend) : snaps;
  return filtered[filtered.length - 1];
}

export async function ensureWorkspacesGitignore(rootDir: string): Promise<void> {
  const gi = join(rootDir, ".clawql", "workspaces", ".gitignore");
  await mkdir(join(rootDir, ".clawql", "workspaces"), { recursive: true });
  await writeFile(gi, "git-worktree/\n*\n!.gitignore\n!snapshots.json\n", "utf8");
}
