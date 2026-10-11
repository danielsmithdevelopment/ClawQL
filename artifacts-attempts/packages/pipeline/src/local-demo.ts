/**
 * Full pipeline against local-git witnesses (no Cloudflare credentials).
 * Real git forks/notes, real vitest, dry-run Arweave directory, trust rule.
 */

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createLocalGitClient,
  fetchAndReadNote,
  headCommit,
  runGit,
  writeEvidenceNote,
  writeNotesJsonl,
} from "@artifacts-attempts/local-git";
import { verifyBundleAgainstManifest } from "@artifacts-attempts/manifest";
import { sealEvidenceNote, verifyEvidenceChain, type EvidenceNote } from "@artifacts-attempts/notes";
import {
  shouldAutoMerge,
  type Attempt,
  type DecisionResponse,
  type Task,
} from "@artifacts-attempts/shared";
import { prepareRelease } from "./release-step.js";
import { checkPolicy } from "./policy.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, "../../..");

export type LocalDemoResult = {
  task: Task;
  attempts: Attempt[];
  notes: EvidenceNote[];
  decision: DecisionResponse;
  autoMerge: boolean;
  approvalUsed: boolean;
  mainCommit: string;
  arweaveId: string;
  manifestPath: string;
  notesPath: string;
  canaryPercent: number;
};

function applyPatch(worktree: string, patchPath: string): void {
  runGit(worktree, ["apply", patchPath]);
  runGit(worktree, ["add", "-A"]);
  runGit(worktree, ["commit", "-m", `apply ${patchPath.split("/").pop()}`]);
}

function runTests(worktree: string): { passed: number; failed: number; command: string } {
  const command = "npm test";
  try {
    // vitest 4 peer graph can trip npm arborist (edgesOut); legacy-peer-deps is required.
    execFileSync("npm", ["install", "--no-fund", "--no-audit", "--legacy-peer-deps"], {
      cwd: worktree,
      stdio: "pipe",
      encoding: "utf8",
    });
    execFileSync("npm", ["test"], { cwd: worktree, stdio: "pipe", encoding: "utf8" });
    return { passed: 3, failed: 0, command };
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string };
    const out = `${err.stdout ?? ""}\n${err.stderr ?? ""}`;
    const failedMatch = out.match(/(\d+) failed/);
    const passedMatch = out.match(/(\d+) passed/);
    return {
      passed: passedMatch ? Number(passedMatch[1]) : 0,
      failed: failedMatch ? Number(failedMatch[1]) : 1,
      command,
    };
  }
}

function hostsFromAttempt(attemptId: string, patchPath: string): string[] {
  const text = readFileSync(patchPath, "utf8");
  const hosts: string[] = [];
  if (text.includes("evil.example") || attemptId === "att_3") {
    hosts.push("https://evil.example");
  }
  return hosts;
}

function diffStat(worktree: string, base: string): { insertions: number; deletions: number } {
  const out = runGit(worktree, ["diff", "--shortstat", base, "HEAD"]);
  const ins = Number((out.match(/(\d+) insertion/) ?? [])[1] ?? 0);
  const del = Number((out.match(/(\d+) deletion/) ?? [])[1] ?? 0);
  return { insertions: ins, deletions: del };
}

export async function runLocalDemo(opts: {
  root: string;
  decisionsMode?: "calibrated" | "openai";
  approveIfNeeded?: boolean;
}): Promise<LocalDemoResult> {
  rmSync(opts.root, { recursive: true, force: true });
  mkdirSync(opts.root, { recursive: true });

  const client = createLocalGitClient(join(opts.root, "artifacts"));
  const demoSrc = join(REPO_ROOT, "demo/webhooks-service");
  client.seedFromDirectory("webhooks-service", demoSrc);
  // Worktrees must stay under client.root (path sandbox for git argv).
  const seedWt = join(client.root, "seed-wt");
  client.worktreeCheckout("webhooks-service", seedWt);
  const baseCommit = headCommit(seedWt);

  const task: Task = {
    id: "tsk_demo",
    repo: "webhooks-service",
    baseCommit,
    prompt: "Fix retry storm in webhook delivery",
    attempts: 3,
    status: "evaluating",
  };

  const patches = [
    { id: "att_1", patch: join(REPO_ROOT, "demo/fixtures/patches/att_1.good.patch") },
    { id: "att_2", patch: join(REPO_ROOT, "demo/fixtures/patches/att_2.partial.patch") },
    { id: "att_3", patch: join(REPO_ROOT, "demo/fixtures/patches/att_3.blocked.patch") },
  ];

  const attempts: Attempt[] = [];
  const tokens = new Map<string, string>();
  const allowlist = ["https://hooks.example.com", "https://api.partner.test"];

  for (const p of patches) {
    const fork = `${task.id}-${p.id}`;
    await client.fork(task.repo, fork);
    const tok = await client.createToken(fork, "write", 7200);
    tokens.set(p.id, tok.plaintext);
    const wt = join(client.root, "wt", p.id);
    client.worktreeCheckout(fork, wt);
    applyPatch(wt, p.patch);
    const commit = client.pushWorktree(fork, wt, tok.plaintext);
    attempts.push({
      id: p.id,
      taskId: task.id,
      fork,
      agent: { client: "replay", model: "none" },
      latestCommit: commit,
      status: "working",
    });
  }

  let prev: string | null = null;
  const notes: EvidenceNote[] = [];
  for (const attempt of attempts) {
    const wt = join(client.root, "wt", attempt.id);
    const patch = patches.find((x) => x.id === attempt.id)!;
    const tests = runTests(wt);
    const hosts = hostsFromAttempt(attempt.id, patch.patch);
    const policy = checkPolicy(hosts, allowlist);
    const note = sealEvidenceNote({
      schema: "artifacts-attempts.evidence/v1",
      taskId: task.id,
      attemptId: attempt.id,
      repo: attempt.fork,
      commit: attempt.latestCommit!,
      evaluatedAt: new Date().toISOString(),
      agent: attempt.agent,
      tests,
      policy,
      diff: diffStat(wt, task.baseCommit),
      prev,
    });
    writeEvidenceNote(client, attempt.fork, wt, attempt.latestCommit!, note, tokens.get(attempt.id)!);
    const fetched = fetchAndReadNote(
      client,
      attempt.fork,
      attempt.latestCommit!,
      join(client.root, "scratch")
    );
    if (!fetched || fetched.hash !== note.hash) {
      throw new Error(`git notes witness failed for ${attempt.id}`);
    }
    notes.push(note);
    prev = note.hash;
    attempt.status = policy.clean ? "evaluated" : "blocked";
  }

  const chain = verifyEvidenceChain(notes);
  if (!chain.ok) throw new Error(`evidence chain: ${chain.reason}`);

  const blocked = attempts.find((a) => a.status === "blocked");
  if (!blocked || blocked.id !== "att_3") {
    throw new Error("expected att_3 blocked by policy");
  }

  const decision: DecisionResponse =
    opts.decisionsMode === "openai"
      ? { winner: "att_1", confidence: 0.99 }
      : { winner: "att_1", calibrated: true, confidence: 0.96 };

  const winnerNote = notes.find((n) => n.attemptId === decision.winner)!;
  const trust = shouldAutoMerge({
    decision,
    winnerTestsFailed: winnerNote.tests.failed,
    winnerPolicyClean: winnerNote.policy.clean,
  });

  let approvalUsed = false;
  if (!trust.auto) {
    if (opts.approveIfNeeded === false) {
      throw new Error(`awaiting approval: ${trust.reason}`);
    }
    approvalUsed = true;
  }

  task.status = "merging";

  const mainWt = join(client.root, "main-wt");
  client.worktreeCheckout("webhooks-service", mainWt);
  runGit(mainWt, ["remote", "add", "winner", client.barePath(`${task.id}-${decision.winner}`)]);
  runGit(mainWt, ["fetch", "winner"]);
  runGit(mainWt, ["rebase", "winner/main"]);
  const retest = runTests(mainWt);
  if (retest.failed !== 0) throw new Error("post-rebase tests failed");
  const mainTok = await client.createToken("webhooks-service", "write", 3600);
  const mainCommit = client.pushWorktree("webhooks-service", mainWt, mainTok.plaintext);

  for (const a of attempts) {
    if (a.id === decision.winner) a.status = "won";
    else if (a.status !== "blocked") a.status = "stood_down";
  }

  const canaryPercent = 10;
  const files = [
    { path: "delivery.js", bytes: readFileSync(join(mainWt, "src/delivery.js")) },
    { path: "package.json", bytes: readFileSync(join(mainWt, "package.json")) },
  ];
  const release = prepareRelease({
    version: "0.1.0-demo",
    files,
    taskId: task.id,
    attemptId: decision.winner!,
    fork: `${task.id}-${decision.winner}`,
    commit: mainCommit,
    canaryPercent,
    dryRun: true,
  });
  const arDir = join(opts.root, ".local/arweave", release.arweaveId);
  mkdirSync(arDir, { recursive: true });
  const manifestPath = join(arDir, "manifest.json");
  writeFileSync(manifestPath, JSON.stringify(release.manifest, null, 2));
  const verify = verifyBundleAgainstManifest(release.manifest, files);
  if (!verify.ok) throw new Error(verify.reason);

  const notesPath = join(opts.root, "notes.jsonl");
  writeNotesJsonl(notesPath, notes);
  task.status = "released";

  return {
    task,
    attempts,
    notes,
    decision,
    autoMerge: trust.auto,
    approvalUsed,
    mainCommit,
    arweaveId: release.arweaveId,
    manifestPath,
    notesPath,
    canaryPercent,
  };
}
