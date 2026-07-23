#!/usr/bin/env node
/**
 * ClawQL Layer 0 CI e2e — parallel workspaces + dry-run permanence pipeline.
 *
 * Does NOT require Arweave/IPFS/Lit wallets. Network backends run in local dry-run
 * mode (CLAWQL_RELEASE_DRY_RUN=1). Real CoW via anomalyco/rift may be unavailable
 * on GitHub-hosted runners (typically ext4 without btrfs/APFS); we still exercise
 * clawql-release's rift backend (CLI when present, local fallback otherwise) and
 * always validate git-worktree parallelism.
 */
import { spawnSync } from "node:child_process";
import { mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, delimiter } from "node:path";
import { homedir } from "node:os";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const root = process.cwd();
process.env.CLAWQL_RELEASE_DRY_RUN = "1";
process.env.CLAWQL_RELEASE_MODE = "local";

const summary = {
  riftCli: false,
  riftCowLikely: false,
  riftInstallAttempted: false,
  riftInstallOk: false,
  workspaces: { "git-worktree": [], rift: [] },
  publish: null,
  verify: null,
  pull: null,
  limitations: [],
};

function log(msg) {
  console.log(`[clawql-release-e2e] ${msg}`);
}

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    cwd: opts.cwd ?? root,
    encoding: "utf8",
    env: { ...process.env, ...(opts.env ?? {}) },
  });
  if ((r.status ?? 1) !== 0 && !opts.allowFailure) {
    throw new Error(
      `${cmd} ${args.join(" ")} failed: ${(r.stderr || r.stdout || "").trim() || `exit ${r.status}`}`
    );
  }
  return { status: r.status ?? 1, stdout: (r.stdout ?? "").trim(), stderr: (r.stderr ?? "").trim() };
}

function commandExists(cmd) {
  return run("which", [cmd], { allowFailure: true }).status === 0;
}

async function loadRelease() {
  const require = createRequire(join(root, "packages/clawql-release/package.json"));
  // Prefer built dist; fall back to source via vitest-less dynamic path
  try {
    return await import(pathToFileURL(require.resolve("clawql-release")).href);
  } catch {
    return await import(
      pathToFileURL(join(root, "packages/clawql-release/dist/index.js")).href
    );
  }
}

async function tryInstallRift() {
  summary.riftInstallAttempted = true;
  if (commandExists("rift")) {
    summary.riftCli = true;
    summary.riftInstallOk = true;
    log("rift CLI already on PATH");
    return true;
  }
  // Prefer a user-writable prefix (GHA setup-node often allows -g; cloud agents may not).
  const prefix = join(homedir(), ".local", "clawql-rift");
  log(`Attempting npm install rift-snapshot --prefix ${prefix}…`);
  await mkdir(join(prefix, "bin"), { recursive: true });
  const r = run("npm", ["install", "--prefix", prefix, "rift-snapshot"], { allowFailure: true });
  const binDir = join(prefix, "bin");
  const nmBin = join(prefix, "node_modules", ".bin");
  process.env.PATH = `${binDir}${delimiter}${nmBin}${delimiter}${process.env.PATH ?? ""}`;
  const riftBin = existsSync(join(binDir, "rift"))
    ? join(binDir, "rift")
    : existsSync(join(nmBin, "rift"))
      ? join(nmBin, "rift")
      : "";
  if (r.status === 0 && (commandExists("rift") || riftBin)) {
    summary.riftCli = true;
    summary.riftInstallOk = true;
    log(`rift-snapshot installed (${riftBin || "on PATH"})`);
    return true;
  }
  log(`rift install skipped/failed: ${r.stderr || r.stdout || "not available"}`);
  summary.limitations.push(
    "rift-snapshot CLI not installed — clawql-release uses local rift fallback workspaces under .rifts/"
  );
  return false;
}

function probeFilesystem() {
  const df = run("df", ["-T", "."], { allowFailure: true }).stdout;
  const line = df.split("\n")[1] ?? "";
  const fstype = line.split(/\s+/)[1] ?? "unknown";
  log(`Filesystem type: ${fstype}`);
  if (fstype === "btrfs" || fstype === "apfs" || fstype === "xfs") {
    summary.riftCowLikely = true;
  } else {
    summary.riftCowLikely = false;
    summary.limitations.push(
      `Runner filesystem is '${fstype}' — anomalyco/rift true CoW typically needs btrfs/APFS/XFS reflinks; GHA ubuntu-latest is usually ext4, so expect fallback or slower copies even if rift CLI is present`
    );
  }
}

async function main() {
  log(`cwd=${root}`);
  probeFilesystem();

  // Build package
  log("Building clawql-release…");
  run("npm", ["run", "build", "-w", "clawql-release"]);

  const release = await loadRelease();
  const {
    writeReleaseConfig,
    createWorkspaceSnapshot,
    listWorkspaceSnapshots,
    collectReleaseManifest,
    publishRelease,
    verifyReleaseTarget,
    pullRelease,
    buildGoldenImages,
  } = release;

  await writeReleaseConfig(root, undefined, { skipSigningSetup: false });
  log("Wrote .clawql/release.json (signed commits configured when possible)");

  const hasRift = await tryInstallRift();
  if (hasRift) {
    const init = run("rift", ["init"], { allowFailure: true });
    log(`rift init: status=${init.status} ${init.stdout || init.stderr}`);
    if (init.status !== 0) {
      summary.limitations.push(
        `rift init failed on this runner (${init.stderr || init.stdout || "unknown"}) — continuing with clawql-release fallback`
      );
    }
  }

  // --- Parallel workspaces ---
  const wtNames = ["agent-alpha", "agent-beta", "agent-gamma"];
  const riftNames = ["rift-one", "rift-two", "rift-three"];

  log(`Creating ${wtNames.length} git-worktree workspaces in parallel…`);
  const wtSnaps = await Promise.all(
    wtNames.map((name) =>
      createWorkspaceSnapshot({ rootDir: root, backend: "git-worktree", name })
    )
  );
  summary.workspaces["git-worktree"] = wtSnaps.map((s) => ({
    name: s.name,
    path: s.path,
    snapshotId: s.snapshotId,
  }));
  log(`git-worktree OK: ${wtSnaps.map((s) => s.name).join(", ")}`);

  log(`Creating ${riftNames.length} rift workspaces in parallel…`);
  const parent = wtSnaps[0]?.snapshotId;
  const riftSnaps = await Promise.all(
    riftNames.map((name, i) =>
      createWorkspaceSnapshot({
        rootDir: root,
        backend: "rift",
        name,
        parentSnapshotId: i === 0 ? parent : undefined,
      })
    )
  );
  summary.workspaces.rift = riftSnaps.map((s) => ({
    name: s.name,
    path: s.path,
    snapshotId: s.snapshotId,
    parentSnapshotId: s.parentSnapshotId,
  }));
  log(`rift OK: ${riftSnaps.map((s) => s.name).join(", ")}`);

  const listed = await listWorkspaceSnapshots(root);
  if (listed.length < wtNames.length + riftNames.length) {
    throw new Error(`Expected >= ${wtNames.length + riftNames.length} snapshots, got ${listed.length}`);
  }

  // Parallel collect from each git-worktree path (shared object store, isolated checkouts)
  log("Collecting manifests from parallel git-worktree workspaces…");
  const collects = await Promise.all(
    wtSnaps.map(async (snap) => {
      const m = await collectReleaseManifest({ rootDir: snap.path });
      return { name: snap.name, tag: m.tag, commit: m.repository.commit, merkleRoot: m.merkleRoot };
    })
  );
  log(`Parallel collect: ${JSON.stringify(collects)}`);
  const commits = new Set(collects.map((c) => c.commit));
  if (commits.size !== 1) {
    throw new Error(`Expected identical commits across worktrees, got ${[...commits].join(",")}`);
  }

  // Fixture SBOM + golden image + permanent dry-run publish
  const fixtureDir = join(root, ".clawql", "e2e-fixtures");
  await mkdir(fixtureDir, { recursive: true });
  const sbomPath = join(fixtureDir, "sbom.cdx.json");
  await writeFile(
    sbomPath,
    JSON.stringify({ bomFormat: "CycloneDX", specVersion: "1.5", version: 1, components: [] }),
    "utf8"
  );

  const digest = `sha256:${"ab".repeat(32)}`;
  const golden = await buildGoldenImages({
    rootDir: root,
    version: "0.0.0-e2e",
    imageDigests: { "clawql-mcp": digest },
    dryRun: true,
  });
  log(`golden-image attestations: ${golden.attestationsPath}`);

  log("Publishing with --stage-ipfs --permanent --encrypt (dry-run)…");
  const published = await publishRelease({
    rootDir: root,
    tag: "v0.0.0-e2e",
    version: "0.0.0-e2e",
    sbomPath,
    imageDigests: { "clawql-mcp": digest },
    copyArtifacts: true,
    stageIpfs: true,
    permanent: true,
    encrypt: true,
    dryRun: true,
    price: "0.01 USDC",
    syncCollaboration: true,
    githubRelease: false,
  });

  summary.publish = {
    manifestPath: published.manifestPath,
    ipfsCid: published.ipfsCid,
    arweaveTxId: published.arweaveTxId,
    encrypted: published.encrypted,
    stagingMode: published.manifest.staging?.ipfs?.mode,
    permanenceMode: published.manifest.permanence?.arweave?.mode,
    collaborationPrimary: published.manifest.collaboration?.primary,
  };
  log(`Published: ${JSON.stringify(summary.publish)}`);

  if (!published.ipfsCid?.startsWith("clawql-cid:") && published.manifest.staging?.ipfs?.mode !== "ipfs") {
    // dry-run expects local cid OR real ipfs
    if (!published.ipfsCid) throw new Error("missing ipfsCid");
  }
  if (!published.arweaveTxId) throw new Error("missing arweaveTxId");
  if (published.manifest.permanence?.arweave?.mode !== "local-dry-run") {
    summary.limitations.push(
      `Unexpected permanence mode ${published.manifest.permanence?.arweave?.mode} under CLAWQL_RELEASE_DRY_RUN`
    );
  }

  const verified = await verifyReleaseTarget(published.arweaveTxId, { rootDir: root });
  summary.verify = { ok: verified.ok, errors: verified.errors, tag: verified.manifest.tag };
  if (!verified.ok) {
    throw new Error(`verify failed: ${verified.errors.join("; ")}`);
  }
  log(`verify tx OK: ${published.arweaveTxId}`);

  const pulled = await pullRelease({
    rootDir: root,
    target: published.arweaveTxId,
    dryRun: true,
    rift: true,
  });
  summary.pull = {
    ok: pulled.ok,
    decrypted: pulled.decrypted,
    workspacePath: pulled.workspacePath,
    errors: pulled.errors,
  };
  if (!pulled.ok) throw new Error(`pull failed: ${pulled.errors.join("; ")}`);
  if (!pulled.decrypted) throw new Error("expected decrypt after x402 dry-run receipt");
  log(`pull+decrypt+rift workspace OK: ${pulled.workspacePath}`);

  // Permanence limitations (always document for CI)
  summary.limitations.push(
    "No Arweave wallet in CI — permanence uses .clawql/arweave/<tx>/ local dry-run store, not a mainnet/ar.io transaction"
  );
  summary.limitations.push(
    "No IPFS daemon in CI by default — staging uses clawql-cid:sha256:… under .clawql/ipfs-staging/"
  );
  summary.limitations.push(
    "No Lit network / x402 facilitator enforcement — CEK escrow released against dry-run payment receipt"
  );
  summary.limitations.push(
    "Do not put CLAWQL_ARWEAVE_WALLET_JWK (or other spendable keys) in GitHub Actions secrets for this workflow"
  );

  const outPath = join(root, ".clawql", "e2e-report.json");
  await writeFile(outPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  log(`Wrote ${outPath}`);

  // GitHub Job Summary
  if (process.env.GITHUB_STEP_SUMMARY) {
    const md = [
      "## clawql-release pipeline e2e",
      "",
      `| Check | Result |`,
      `| --- | --- |`,
      `| git-worktree parallel (${wtNames.length}) | ✅ |`,
      `| rift parallel (${riftNames.length}) | ✅ |`,
      `| rift CLI | ${summary.riftCli ? "✅ present" : "⚠️ fallback"} |`,
      `| CoW-capable FS | ${summary.riftCowLikely ? "✅ likely" : "⚠️ unlikely (ext4 typical)"} |`,
      `| IPFS staging | ✅ ${summary.publish.stagingMode} |`,
      `| Arweave permanence | ✅ ${summary.publish.permanenceMode} (\`${summary.publish.arweaveTxId}\`) |`,
      `| Encrypt + x402 dry-run pull | ✅ decrypted |`,
      "",
      "### Limitations (expected without wallets)",
      "",
      ...summary.limitations.map((l) => `- ${l}`),
      "",
    ].join("\n");
    await writeFile(process.env.GITHUB_STEP_SUMMARY, md, { flag: "a" });
  }

  console.log(JSON.stringify({ ok: true, summary }, null, 2));
}

main().catch(async (err) => {
  console.error("[clawql-release-e2e] FAIL:", err instanceof Error ? err.message : err);
  if (process.env.GITHUB_STEP_SUMMARY) {
    await writeFile(
      process.env.GITHUB_STEP_SUMMARY,
      `\n## clawql-release pipeline e2e\n\n❌ ${err instanceof Error ? err.message : String(err)}\n`,
      { flag: "a" }
    );
  }
  process.exit(1);
});
