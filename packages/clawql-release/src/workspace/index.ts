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

/** Serialize store RMW so parallel workspace creates cannot clobber snapshots.json. */
const storeLocks = new Map<string, Promise<unknown>>();

async function withStoreLock<T>(rootDir: string, fn: () => Promise<T>): Promise<T> {
  const key = resolve(rootDir);
  const prev = storeLocks.get(key) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((r) => {
    release = r;
  });
  storeLocks.set(
    key,
    prev.then(() => gate)
  );
  await prev;
  try {
    return await fn();
  } finally {
    release();
  }
}

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

async function registerSnapshot(
  rootDir: string,
  snap: WorkspaceSnapshot
): Promise<WorkspaceSnapshot> {
  return withStoreLock(rootDir, async () => {
    const store = await loadStore(rootDir);
    const existing = store.snapshots.find(
      (s) => s.name === snap.name && s.backend === snap.backend
    );
    if (existing) return existing;
    store.snapshots.push(snap);
    await saveStore(rootDir, store);
    return snap;
  });
}

export async function createGitWorktreeSnapshot(
  options: SnapshotOptions
): Promise<WorkspaceSnapshot> {
  const rootDir = resolve(options.rootDir);
  const worktreesRoot = join(rootDir, ".clawql", "workspaces", "git-worktree");
  await mkdir(worktreesRoot, { recursive: true });
  const path = join(worktreesRoot, options.name);

  const early = await withStoreLock(rootDir, async () => {
    const store = await loadStore(rootDir);
    return store.snapshots.find((s) => s.name === options.name && s.backend === "git-worktree");
  });
  if (early) return early;

  const branch = options.branch ?? `clawql/${options.name}`;
  const head = readGitHead(rootDir);

  // git worktree add takes a repo lock — serialize via store lock only for meta;
  // allowFailure + retry handles concurrent add races.
  runCommand("git", ["branch", branch, "HEAD"], { cwd: rootDir, allowFailure: true });
  let add = runCommand("git", ["worktree", "add", path, branch], {
    cwd: rootDir,
    allowFailure: true,
  });
  if (add.status !== 0) {
    add = runCommand("git", ["worktree", "add", "-B", branch, path, "HEAD"], {
      cwd: rootDir,
      allowFailure: true,
    });
  }
  if (add.status !== 0) {
    // Brief retry for lock contention under parallel creates
    await new Promise((r) => setTimeout(r, 50 + Math.floor(Math.random() * 100)));
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
  return registerSnapshot(rootDir, snap);
}

/**
 * Rift CoW backend. Uses `rift` CLI (rift-snapshot) when available; otherwise creates a local
 * provenance workspace under `.rifts/` (CI / machines without btrfs·APFS·XFS CoW).
 */
export async function createRiftSnapshot(options: SnapshotOptions): Promise<WorkspaceSnapshot> {
  const rootDir = resolve(options.rootDir);

  const early = await withStoreLock(rootDir, async () => {
    const store = await loadStore(rootDir);
    return store.snapshots.find((s) => s.name === options.name && s.backend === "rift");
  });
  if (early) return early;

  const riftsRoot = join(rootDir, ".rifts");
  await mkdir(riftsRoot, { recursive: true });
  let path = join(riftsRoot, options.name);
  const head = readGitHead(rootDir);
  let mode: "rift-cli" | "local-fallback" = "local-fallback";

  if (commandExists("rift")) {
    runCommand("rift", ["init"], { cwd: rootDir, allowFailure: true });
    const created = runCommand("rift", ["create", "--name", options.name], {
      cwd: rootDir,
      allowFailure: true,
    });
    if (created.status === 0) {
      const lines = created.stdout
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
      const printed = lines[lines.length - 1];
      if (printed && (printed.startsWith("/") || printed.includes(options.name))) {
        path = printed;
        mode = "rift-cli";
      }
    }
  }

  if (mode === "local-fallback") {
    await mkdir(path, { recursive: true });
    await writeFile(
      join(path, ".clawql-rift-snapshot.json"),
      `${JSON.stringify(
        {
          backend: "rift",
          mode: "local-fallback",
          parentSnapshotId: options.parentSnapshotId,
          commit: head.commit,
          createdAt: new Date().toISOString(),
          note: commandExists("rift")
            ? "rift CLI present but create did not yield a path — local fallback for provenance"
            : "rift CLI not found — local fallback workspace for provenance only",
        },
        null,
        2
      )}\n`,
      "utf8"
    );
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
  return registerSnapshot(rootDir, snap);
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
  return withStoreLock(root, async () => {
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
  });
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
