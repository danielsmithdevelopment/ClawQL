/**
 * clawql-release — Layer 0 CLI (immutable releases pipeline)
 */
import { resolve } from "node:path";
import { writeReleaseConfig } from "./config.js";
import { collectReleaseManifest } from "./collect.js";
import { buildReleaseManifest } from "./manifest.js";
import { lintCqmFiles } from "./ontology-schema.js";
import { publishRelease } from "./publish.js";
import { verifyReleaseTarget } from "./verify.js";
import {
  createWorkspaceSnapshot,
  listWorkspaceSnapshots,
  removeWorkspaceSnapshot,
} from "./workspace/index.js";
import { buildGoldenImages } from "./golden-image.js";
import { pullRelease } from "./pull.js";
import type { WorkspaceBackend } from "./types.js";

function usage(): void {
  console.log(`clawql-release — immutable release pipeline (Layer 0)

Usage:
  clawql-release init [--root DIR]
  clawql-release immutable-volume snapshot --name NAME [--backend rift|git-worktree]
  clawql-release immutable-volume list
  clawql-release immutable-volume remove --name NAME
  clawql-release golden-image build [--version X] [--image-digest NAME=sha256:...]
  clawql-release collect|manifest|publish [options]
  clawql-release verify <bundle-dir|manifest.json|arweave-tx-id>
  clawql-release pull <target> [--rift] [--out DIR]
  clawql-release lint <file.cqm> [more.cqm...]

Publish options:
  --tag vX.Y.Z
  --sbom PATH --npm-tgz PATH
  --image-digest NAME=sha256:...
  --github                 Attach manifest to GitHub Release (mirror)
  --stage-ipfs             Stage bundle on IPFS (or local content-addressed store)
  --permanent              Upload permanent release via ar.io / local dry-run store
  --encrypt                Encrypt bundle; Lit + x402 gate decryption
  --price "0.50 USDC"      Paid release price (implies access metadata)
  --dry-run                Force local/dry-run backends
  --no-copy

Examples:
  clawql-release init
  clawql-release immutable-volume snapshot --backend git-worktree --name agent-42
  clawql-release golden-image build --image-digest clawql-mcp=sha256:abc...
  clawql-release publish --tag v7.1.0 --sbom sbom.cdx.json --stage-ipfs --permanent --github
  clawql-release verify releases/v7.1.0/manifest.json
  clawql-release pull local_abc123 --rift
`);
}

function parseArgs(argv: string[]): {
  cmd: string;
  flags: Record<string, string | boolean>;
  positional: string[];
} {
  const flags: Record<string, string | boolean> = {};
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--root") flags.root = argv[++i] ?? ".";
    else if (a === "--tag") flags.tag = argv[++i] ?? "";
    else if (a === "--sbom") flags.sbom = argv[++i] ?? "";
    else if (a === "--npm-tgz") flags.npmTgz = argv[++i] ?? "";
    else if (a === "--image-digests-file") flags.imageDigestsFile = argv[++i] ?? "";
    else if (a === "--name") flags.name = argv[++i] ?? "";
    else if (a === "--backend") flags.backend = argv[++i] ?? "";
    else if (a === "--branch") flags.branch = argv[++i] ?? "";
    else if (a === "--version") flags.version = argv[++i] ?? "";
    else if (a === "--out") flags.out = argv[++i] ?? "";
    else if (a === "--price") flags.price = argv[++i] ?? "";
    else if (a.startsWith("--image-digest=")) {
      const prev = (flags.imageDigest as string | undefined) ?? "";
      flags.imageDigest = prev
        ? `${prev},${a.slice("--image-digest=".length)}`
        : a.slice("--image-digest=".length);
    } else if (a === "--image-digest") {
      const v = argv[++i] ?? "";
      const prev = (flags.imageDigest as string | undefined) ?? "";
      flags.imageDigest = prev ? `${prev},${v}` : v;
    } else if (a === "--github") flags.github = true;
    else if (a === "--no-copy") flags.noCopy = true;
    else if (a === "--json") flags.json = true;
    else if (a === "--stage-ipfs") flags.stageIpfs = true;
    else if (a === "--permanent") flags.permanent = true;
    else if (a === "--encrypt") flags.encrypt = true;
    else if (a === "--dry-run") flags.dryRun = true;
    else if (a === "--rift") flags.rift = true;
    else if (!a.startsWith("-")) positional.push(a);
  }
  return { cmd: positional[0] ?? "help", flags, positional: positional.slice(1) };
}

function parseImageDigests(flags: Record<string, string | boolean>): Record<string, string> {
  const out: Record<string, string> = {};
  const inline = typeof flags.imageDigest === "string" ? flags.imageDigest : "";
  for (const part of inline
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)) {
    const eq = part.indexOf("=");
    if (eq <= 0) continue;
    out[part.slice(0, eq).trim()] = part.slice(eq + 1).trim();
  }
  return out;
}

async function loadImageDigestsFile(path: string): Promise<Record<string, string>> {
  const { readFile } = await import("node:fs/promises");
  const raw = await readFile(path, "utf8");
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(parsed)) {
    if (typeof v === "string" && v.trim()) out[k] = v.trim();
  }
  return out;
}

async function main(): Promise<void> {
  const { cmd, flags, positional } = parseArgs(process.argv.slice(2));
  if (cmd === "help" || cmd === "--help" || cmd === "-h") {
    usage();
    return;
  }

  const rootDir = resolve(typeof flags.root === "string" ? flags.root : process.cwd());
  let imageDigests = parseImageDigests(flags);
  if (typeof flags.imageDigestsFile === "string" && flags.imageDigestsFile) {
    imageDigests = { ...imageDigests, ...(await loadImageDigestsFile(flags.imageDigestsFile)) };
  }

  const collectBase = {
    rootDir,
    tag: typeof flags.tag === "string" && flags.tag ? flags.tag : undefined,
    version: typeof flags.version === "string" && flags.version ? flags.version : undefined,
    sbomPath: typeof flags.sbom === "string" && flags.sbom ? resolve(flags.sbom) : undefined,
    npmTarballPath:
      typeof flags.npmTgz === "string" && flags.npmTgz ? resolve(flags.npmTgz) : undefined,
    imageDigests: Object.keys(imageDigests).length ? imageDigests : undefined,
    ci: process.env.GITHUB_ACTIONS === "true" ? "github-actions" : undefined,
    workflow: process.env.GITHUB_WORKFLOW,
  };

  if (cmd === "init") {
    const path = await writeReleaseConfig(rootDir);
    console.log(`Wrote ${path}`);
    console.log("Signed commits enabled by default when a signing identity is available.");
    return;
  }

  if (cmd === "immutable-volume") {
    const sub = positional[0] ?? "help";
    if (sub === "snapshot") {
      const name = typeof flags.name === "string" ? flags.name : "";
      if (!name) {
        console.error(
          "Usage: clawql-release immutable-volume snapshot --name NAME [--backend ...]"
        );
        process.exitCode = 1;
        return;
      }
      const backend = (
        typeof flags.backend === "string" && flags.backend ? flags.backend : "git-worktree"
      ) as WorkspaceBackend;
      const snap = await createWorkspaceSnapshot({
        rootDir,
        backend,
        name,
        branch: typeof flags.branch === "string" ? flags.branch : undefined,
      });
      if (flags.json) console.log(JSON.stringify(snap, null, 2));
      else {
        console.log(`snapshotId: ${snap.snapshotId}`);
        console.log(`backend: ${snap.backend}`);
        console.log(`path: ${snap.path}`);
      }
      return;
    }
    if (sub === "list") {
      const snaps = await listWorkspaceSnapshots(rootDir);
      if (flags.json) console.log(JSON.stringify(snaps, null, 2));
      else {
        for (const s of snaps) {
          console.log(`${s.snapshotId}\t${s.backend}\t${s.name}\t${s.path}`);
        }
        if (!snaps.length) console.log("(no snapshots)");
      }
      return;
    }
    if (sub === "remove") {
      const name = typeof flags.name === "string" ? flags.name : (positional[1] ?? "");
      if (!name) {
        console.error("Usage: clawql-release immutable-volume remove --name NAME");
        process.exitCode = 1;
        return;
      }
      const removed = await removeWorkspaceSnapshot(rootDir, name);
      console.log(removed ? `Removed ${removed.snapshotId}` : `No snapshot named ${name}`);
      return;
    }
    console.error(`Unknown immutable-volume subcommand: ${sub}`);
    usage();
    process.exitCode = 1;
    return;
  }

  if (cmd === "golden-image") {
    const sub = positional[0] ?? "build";
    if (sub !== "build") {
      console.error("Usage: clawql-release golden-image build");
      process.exitCode = 1;
      return;
    }
    const result = await buildGoldenImages({
      rootDir,
      version: collectBase.version ?? collectBase.tag?.replace(/^v/, ""),
      imageDigests: collectBase.imageDigests,
      dryRun: Boolean(flags.dryRun),
    });
    if (flags.json) console.log(JSON.stringify(result, null, 2));
    else {
      console.log(`attestations: ${result.attestationsPath}`);
      console.log(`images: ${Object.keys(result.images).join(", ") || "(none)"}`);
      for (const d of result.detail) console.log(`  ${d}`);
    }
    return;
  }

  if (cmd === "collect") {
    const manifest = await collectReleaseManifest(collectBase);
    if (flags.json) {
      console.log(JSON.stringify(manifest, null, 2));
    } else {
      console.log(`version: ${manifest.version}`);
      console.log(`tag: ${manifest.tag}`);
      console.log(`commit: ${manifest.repository.commit}`);
      console.log(`merkleRoot: ${manifest.merkleRoot}`);
      console.log(`artifacts: ${Object.keys(manifest.artifacts).join(", ") || "(none)"}`);
      console.log(`images: ${Object.keys(manifest.images).join(", ") || "(none)"}`);
      if (manifest.ontologySchema) {
        console.log(
          `ontologySchema: ${manifest.ontologySchema.path} (${manifest.ontologySchema.entityCount} entities) sha256=${manifest.ontologySchema.sha256}`
        );
      }
    }
    return;
  }

  if (cmd === "manifest") {
    const { manifestPath, bundleDir, manifest } = await buildReleaseManifest({
      ...collectBase,
      copyArtifacts: !flags.noCopy,
    });
    console.log(`Wrote ${manifestPath}`);
    console.log(`Bundle: ${bundleDir}`);
    console.log(`merkleRoot: ${manifest.merkleRoot}`);
    return;
  }

  if (cmd === "lint") {
    const files = positional.map((p) => resolve(p));
    if (!files.length) {
      console.error("Usage: clawql-release lint <file.cqm> [more.cqm...]");
      process.exitCode = 1;
      return;
    }
    const result = await lintCqmFiles(files);
    if (flags.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(`cqm lint: ${result.filesChecked} file(s)`);
      for (const issue of result.issues) {
        console.log(`${issue.severity.toUpperCase()} ${issue.path}: ${issue.message}`);
      }
      console.log(result.ok ? "OK" : "FAILED");
    }
    process.exitCode = result.ok ? 0 : 1;
    return;
  }

  if (cmd === "verify") {
    const target = positional[0];
    if (!target) {
      console.error("Usage: clawql-release verify <bundle-dir|manifest.json|arweave-tx-id>");
      process.exitCode = 1;
      return;
    }
    const looksLocal =
      target.endsWith(".json") ||
      target.includes("/") ||
      target.includes("\\") ||
      target.startsWith(".");
    const final = await verifyReleaseTarget(looksLocal ? resolve(target) : target, { rootDir });
    if (final.ok) {
      console.log(`OK — manifest ${final.manifest.tag} merkleRoot=${final.manifest.merkleRoot}`);
      if (final.manifest.permanence?.arweave?.txId) {
        console.log(`arweave: ${final.manifest.permanence.arweave.txId}`);
      }
      for (const w of final.warnings ?? []) console.log(`note: ${w}`);
      return;
    }
    for (const e of final.errors) console.error(`FAIL: ${e}`);
    process.exitCode = 1;
    return;
  }

  if (cmd === "pull") {
    const target = positional[0];
    if (!target) {
      console.error("Usage: clawql-release pull <target> [--rift] [--out DIR]");
      process.exitCode = 1;
      return;
    }
    const result = await pullRelease({
      rootDir,
      target: target.includes("/") || target.endsWith(".json") ? resolve(target) : target,
      outDir: typeof flags.out === "string" ? resolve(flags.out) : undefined,
      rift: Boolean(flags.rift),
      dryRun: Boolean(flags.dryRun),
    });
    if (result.ok) {
      console.log(`OK — pulled ${result.manifest.tag} → ${result.outDir}`);
      if (result.workspacePath) console.log(`workspace: ${result.workspacePath}`);
      if (result.decrypted) console.log("decrypted: yes");
      return;
    }
    for (const e of result.errors) console.error(`FAIL: ${e}`);
    process.exitCode = 1;
    return;
  }

  if (cmd === "publish") {
    const result = await publishRelease({
      ...collectBase,
      copyArtifacts: !flags.noCopy,
      githubRelease: Boolean(flags.github),
      stageIpfs: Boolean(flags.stageIpfs),
      permanent: Boolean(flags.permanent),
      encrypt: Boolean(flags.encrypt),
      dryRun: Boolean(flags.dryRun),
      price: typeof flags.price === "string" && flags.price ? flags.price : undefined,
      syncCollaboration: true,
    });
    console.log(`Published manifest: ${result.manifestPath}`);
    console.log(`Bundle: ${result.bundleDir}`);
    if (result.ipfsCid) console.log(`IPFS staging CID: ${result.ipfsCid}`);
    if (result.arweaveTxId) console.log(`Arweave tx: ${result.arweaveTxId}`);
    if (result.encrypted) console.log("encrypted: yes (Lit/x402 gated)");
    if (result.githubReleaseUrl) {
      console.log(`GitHub release: ${result.githubReleaseUrl}`);
    }
    return;
  }

  console.error(`Unknown command: ${cmd}`);
  usage();
  process.exitCode = 1;
}

main().catch((err) => {
  console.error("[clawql-release]", err instanceof Error ? err.message : err);
  process.exit(1);
});
