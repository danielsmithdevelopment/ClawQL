#!/usr/bin/env node
/**
 * Build Layer 0 MVP release manifest from CI artifacts (SBOM, npm pack, image digests).
 *
 * Env:
 *   CLAWQL_RELEASE_IMAGE_DIGESTS — JSON object name → sha256 digest
 *   CLAWQL_RELEASE_SBOM — path to CycloneDX JSON (default: sbom.cdx.json in cwd)
 *   CLAWQL_RELEASE_NPM_TGZ — path to clawql-mcp-*.tgz (auto-detect in cwd if unset)
 */
import { readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { publishRelease } from "clawql-release";

const root = resolve(process.cwd());
const tag = process.env.CLAWQL_RELEASE_TAG?.trim();
const sbomPath = process.env.CLAWQL_RELEASE_SBOM?.trim()
  ? resolve(process.env.CLAWQL_RELEASE_SBOM)
  : resolve(root, "sbom-cyclonedx-npm-publish.cdx.json");

let npmTarball = process.env.CLAWQL_RELEASE_NPM_TGZ?.trim()
  ? resolve(process.env.CLAWQL_RELEASE_NPM_TGZ)
  : undefined;

if (!npmTarball) {
  const files = await readdir(root);
  const hit = files.find((f) => f.startsWith("clawql-mcp-") && f.endsWith(".tgz"));
  if (hit) npmTarball = resolve(root, hit);
}

let imageDigests: Record<string, string> | undefined;
if (process.env.CLAWQL_RELEASE_IMAGE_DIGESTS?.trim()) {
  imageDigests = JSON.parse(process.env.CLAWQL_RELEASE_IMAGE_DIGESTS) as Record<string, string>;
}

const result = await publishRelease({
  rootDir: root,
  tag,
  sbomPath: sbomPath,
  npmTarballPath: npmTarball,
  imageDigests,
  copyArtifacts: true,
  githubRelease: process.env.CLAWQL_RELEASE_GITHUB === "1",
  ci: "github-actions",
  workflow: process.env.GITHUB_WORKFLOW,
});

console.log(`[release:manifest] ${result.manifestPath}`);
console.log(`[release:manifest] bundle ${result.bundleDir}`);
