/**
 * clawql-release — Layer 0 MVP CLI
 */
import { resolve } from "node:path";
import { writeReleaseConfig } from "./config.js";
import { collectReleaseManifest } from "./collect.js";
import { buildReleaseManifest } from "./manifest.js";
import { lintCqmFiles } from "./ontology-schema.js";
import { publishRelease } from "./publish.js";
import { verifyReleaseBundle, verifyReleaseManifest } from "./verify.js";

function usage(): void {
  console.log(`clawql-release — immutable release manifest (MVP v0.1)

Usage:
  clawql-release init [--root DIR]
  clawql-release collect [--root DIR] [--tag vX.Y.Z] [--sbom PATH] [--npm-tgz PATH]
  clawql-release manifest [--root DIR] [same flags as collect] [--no-copy]
  clawql-release verify <bundle-dir|manifest.json>
  clawql-release lint <file.cqm> [more.cqm...]
  clawql-release publish [--root DIR] [--tag vX.Y.Z] [--sbom PATH] [--npm-tgz PATH] [--github]

  --image-digest NAME=sha256:...   Repeatable; container digest for manifest Merkle tree
  --image-digests-file PATH        JSON object of image name → digest

Examples:
  clawql-release init
  clawql-release lint examples/governance/acme.cqm
  clawql-release publish --tag v7.0.0 --sbom sbom.cdx.json --npm-tgz clawql-mcp-7.0.0.tgz \\
    --image-digest clawql-mcp=sha256:abc... --github
  clawql-release verify releases/v7.0.0/manifest.json
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
      console.error("Usage: clawql-release verify <bundle-dir|manifest.json>");
      process.exitCode = 1;
      return;
    }
    const abs = resolve(target);
    const result = abs.endsWith("manifest.json")
      ? await verifyReleaseManifest(abs, undefined, { workspaceRoot: rootDir })
      : await verifyReleaseBundle(abs, rootDir);
    if (result.ok) {
      console.log(`OK — manifest ${result.manifest.tag} merkleRoot=${result.manifest.merkleRoot}`);
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
    });
    console.log(`Published manifest: ${result.manifestPath}`);
    console.log(`Bundle: ${result.bundleDir}`);
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
