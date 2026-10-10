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
import { ensureDir, headCommit, initBare, runGit } from "./git.js";

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
  if (src.includes(`${join("")}node_modules${join("")}`) || src.includes("/node_modules/") || src.endsWith("/node_modules")) {
    return false;
  }
  if (src.includes("/.git/") || src.endsWith("/.git") || src.endsWith("\\.git")) return false;
  return true;
}

export function createLocalGitClient(root: string): LocalGitClient {
  ensureDir(root);
  ensureDir(join(root, "repos"));
  ensureDir(join(root, "tokens"));

  const barePath = (name: string) => join(root, "repos", `${name}.git`);

  function authorize(repo: string, tokenPlaintext: string, need: "read" | "write"): void {
    const dir = join(root, "tokens", repo);
    if (!existsSync(dir)) throw new Error(`unknown repo tokens: ${repo}`);
    for (const id of readdirSync(dir)) {
      const raw = JSON.parse(readFileSync(join(dir, id), "utf8")) as StoredToken;
      if (raw.plaintext !== tokenPlaintext) continue;
      if (raw.repo !== repo) throw new Error("token repo mismatch");
      if (need === "write" && raw.scope !== "write") throw new Error("read token cannot write");
      if (Date.parse(raw.expiresAt) < Date.now()) throw new Error("token expired");
      return;
    }
    throw new Error(`push refused: token not valid for ${repo}`);
  }

  return {
    root,
    barePath,
    authorize,

    seedFromDirectory(name, sourceDir) {
      const bare = barePath(name);
      if (existsSync(bare)) {
        return { name, remote: bare, defaultBranch: "main" };
      }
      initBare(bare);
      const tmp = join(root, ".seed", name);
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
      return { name, remote: bare, defaultBranch: "main" };
    },

    async create(name) {
      initBare(barePath(name));
      return { name, remote: barePath(name), defaultBranch: "main" };
    },

    async fork(source, name) {
      const src = barePath(source);
      if (!existsSync(src)) throw new Error(`source missing: ${source}`);
      const dest = barePath(name);
      if (existsSync(dest)) throw new Error(`fork exists: ${name}`);
      runGit(root, ["clone", "--mirror", src, dest]);
      return { name, remote: dest, defaultBranch: "main" };
    },

    async createToken(repo, scope, ttlSeconds) {
      if (!existsSync(barePath(repo))) throw new Error(`repo missing: ${repo}`);
      const id = `tok_${Math.random().toString(16).slice(2, 10)}`;
      const token: StoredToken = {
        plaintext: `local_${repo}_${scope}_${id}`,
        expiresAt: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
        scope,
        repo,
      };
      const dir = join(root, "tokens", repo);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, id), JSON.stringify(token, null, 2));
      return token;
    },

    async list() {
      return readdirSync(join(root, "repos"))
        .filter((n) => n.endsWith(".git"))
        .map((n) => n.replace(/\.git$/, ""));
    },

    async getRemote(repo) {
      return barePath(repo);
    },

    worktreeCheckout(repo, dest) {
      const remote = barePath(repo);
      if (existsSync(dest)) {
        runGit(dest, ["fetch", "origin"]);
        runGit(dest, ["checkout", "main"]);
        runGit(dest, ["reset", "--hard", "origin/main"]);
      } else {
        runGit(root, ["clone", remote, dest]);
        runGit(dest, ["config", "user.email", "agent@local"]);
        runGit(dest, ["config", "user.name", "agent"]);
      }
      return headCommit(dest);
    },

    pushWorktree(repo, worktree, tokenPlaintext) {
      authorize(repo, tokenPlaintext, "write");
      runGit(worktree, ["push", "origin", "HEAD:main"]);
      try {
        runGit(worktree, ["push", "origin", "refs/notes/commits"]);
      } catch {
        /* optional until notes exist */
      }
      return headCommit(worktree);
    },
  };
}
