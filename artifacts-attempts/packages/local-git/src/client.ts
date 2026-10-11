/**
 * Local Artifacts stand-in: real bare git repos under a root directory.
 * Tokens are path-scoped secrets; push with the wrong token is refused.
 *
 * Witnesses are on-disk `git` state — not assertions against a stub's own output.
 * Production swaps this for createBindingClient / createRestClient.
 */

import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { ArtifactsClient, ArtifactsRepoMeta, ArtifactsToken } from "@artifacts-attempts/artifacts-client";
import {
  assertPathUnderRoot,
  assertSafeName,
  ensureDir,
  gitClone,
  headCommit,
  initBare,
  runGit,
} from "./git.js";

export type LocalGitClient = ArtifactsClient & {
  root: string;
  barePath(name: string): string;
  authorize(repo: string, tokenPlaintext: string, need: "read" | "write"): void;
  seedFromDirectory(name: string, sourceDir: string): ArtifactsRepoMeta;
  worktreeCheckout(repo: string, dest: string): string;
  pushWorktree(repo: string, worktree: string, tokenPlaintext: string): string;
};

type StoredToken = ArtifactsToken & { repo: string };

function shouldCopy(src: string): boolean {
  if (src.includes("/node_modules/") || src.endsWith("/node_modules") || src.includes("\\node_modules\\")) {
    return false;
  }
  if (src.includes("/.git/") || src.endsWith("/.git") || src.endsWith("\\.git")) return false;
  return true;
}

export function createLocalGitClient(root: string): LocalGitClient {
  const absRoot = assertPathUnderRoot(root, root);
  ensureDir(absRoot);
  ensureDir(join(absRoot, "repos"));
  ensureDir(join(absRoot, "tokens"));

  const barePath = (name: string) => {
    const safe = assertSafeName(name, "repo");
    return assertPathUnderRoot(absRoot, join(absRoot, "repos", `${safe}.git`));
  };

  function authorize(repo: string, tokenPlaintext: string, need: "read" | "write"): void {
    const safeRepo = assertSafeName(repo, "repo");
    const dir = join(absRoot, "tokens", safeRepo);
    if (!existsSync(dir)) throw new Error(`unknown repo tokens: ${safeRepo}`);
    for (const id of readdirSync(dir)) {
      const raw = JSON.parse(readFileSync(join(dir, id), "utf8")) as StoredToken;
      if (raw.plaintext !== tokenPlaintext) continue;
      if (raw.repo !== safeRepo) throw new Error("token repo mismatch");
      if (need === "write" && raw.scope !== "write") throw new Error("read token cannot write");
      if (Date.parse(raw.expiresAt) < Date.now()) throw new Error("token expired");
      return;
    }
    throw new Error(`push refused: token not valid for ${safeRepo}`);
  }

  return {
    root: absRoot,
    barePath,
    authorize,

    seedFromDirectory(name, sourceDir) {
      const safe = assertSafeName(name, "repo");
      const bare = barePath(safe);
      if (existsSync(bare)) {
        return { name: safe, remote: bare, defaultBranch: "main" };
      }
      initBare(bare);
      const tmp = assertPathUnderRoot(absRoot, join(absRoot, ".seed", safe));
      rmSync(tmp, { recursive: true, force: true });
      mkdirSync(tmp, { recursive: true });
      cpSync(sourceDir, tmp, { recursive: true, filter: shouldCopy });
      runGit(tmp, ["init", "-b", "main"]);
      runGit(tmp, ["config", "user.email", "seed@local"]);
      runGit(tmp, ["config", "user.name", "seed"]);
      runGit(tmp, ["add", "-A"]);
      runGit(tmp, ["commit", "-m", "seed"]);
      runGit(tmp, ["remote", "add", "origin", bare]);
      runGit(tmp, ["push", "-u", "origin", "main"]);
      return { name: safe, remote: bare, defaultBranch: "main" };
    },

    async create(name) {
      const safe = assertSafeName(name, "repo");
      initBare(barePath(safe));
      return { name: safe, remote: barePath(safe), defaultBranch: "main" };
    },

    async fork(source, name) {
      const src = barePath(source);
      if (!existsSync(src)) throw new Error(`source missing: ${source}`);
      const dest = barePath(name);
      if (existsSync(dest)) throw new Error(`fork exists: ${name}`);
      gitClone(absRoot, src, dest, { mirror: true });
      return { name: assertSafeName(name, "repo"), remote: dest, defaultBranch: "main" };
    },

    async createToken(repo, scope, ttlSeconds) {
      const safe = assertSafeName(repo, "repo");
      if (!existsSync(barePath(safe))) throw new Error(`repo missing: ${safe}`);
      const id = `tok_${Math.random().toString(16).slice(2, 10)}`;
      const token: StoredToken = {
        plaintext: `local_${safe}_${scope}_${id}`,
        expiresAt: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
        scope,
        repo: safe,
      };
      const dir = join(absRoot, "tokens", safe);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, id), JSON.stringify(token, null, 2));
      return token;
    },

    async list() {
      return readdirSync(join(absRoot, "repos"))
        .filter((n) => n.endsWith(".git"))
        .map((n) => n.replace(/\.git$/, ""));
    },

    async getRemote(repo) {
      return barePath(repo);
    },

    worktreeCheckout(repo, dest) {
      const remote = barePath(repo);
      const absDest = assertPathUnderRoot(absRoot, dest);
      if (existsSync(absDest)) {
        runGit(absDest, ["fetch", "origin"]);
        runGit(absDest, ["checkout", "main"]);
        runGit(absDest, ["reset", "--hard", "origin/main"]);
      } else {
        gitClone(absRoot, remote, absDest);
        runGit(absDest, ["config", "user.email", "agent@local"]);
        runGit(absDest, ["config", "user.name", "agent"]);
      }
      return headCommit(absDest);
    },

    pushWorktree(repo, worktree, tokenPlaintext) {
      authorize(repo, tokenPlaintext, "write");
      const absWt = assertPathUnderRoot(absRoot, worktree);
      runGit(absWt, ["push", "origin", "HEAD:main"]);
      try {
        runGit(absWt, ["push", "origin", "refs/notes/commits"]);
      } catch {
        /* optional until notes exist */
      }
      return headCommit(absWt);
    },
  };
}
