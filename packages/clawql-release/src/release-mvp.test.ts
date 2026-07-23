import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { collectReleaseManifest } from "./collect.js";
import { buildReleaseManifest } from "./manifest.js";
import { verifyReleaseBundle } from "./verify.js";

function gitInit(dir: string): void {
  spawnSync("git", ["init"], { cwd: dir, encoding: "utf8" });
  spawnSync("git", ["-c", "user.email=test@example.com", "-c", "user.name=Test", "add", "-A"], {
    cwd: dir,
    encoding: "utf8",
  });
  spawnSync(
    "git",
    ["-c", "user.email=test@example.com", "-c", "user.name=Test", "commit", "-m", "test"],
    { cwd: dir, encoding: "utf8" }
  );
}

describe("release manifest MVP", () => {
  it("collects, writes, and verifies a bundle", async () => {
    const root = await mkdtemp(join(tmpdir(), "clawql-release-"));
    await writeFile(
      join(root, "package.json"),
      JSON.stringify({ name: "clawql-mcp", version: "7.0.0" }),
      "utf8"
    );
    const sbomPath = join(root, "sbom.cdx.json");
    await writeFile(sbomPath, '{"bomFormat":"CycloneDX"}', "utf8");
    gitInit(root);

    const { bundleDir } = await buildReleaseManifest({
      rootDir: root,
      tag: "v7.0.0",
      sbomPath,
      imageDigests: { "clawql-mcp": "sha256:" + "ab".repeat(32) },
      copyArtifacts: true,
    });

    const verify = await verifyReleaseBundle(bundleDir);
    expect(verify.ok).toBe(true);
    expect(verify.manifest.version).toBe("7.0.0");
    expect(verify.manifest.artifacts.sbom?.sha256).toHaveLength(64);
  });

  it("detects tampered artifact", async () => {
    const root = await mkdtemp(join(tmpdir(), "clawql-release-"));
    await writeFile(
      join(root, "package.json"),
      JSON.stringify({ name: "clawql-mcp", version: "1.0.0" }),
      "utf8"
    );
    const sbomPath = join(root, "sbom.cdx.json");
    await writeFile(sbomPath, "original", "utf8");
    gitInit(root);

    const { bundleDir } = await buildReleaseManifest({
      rootDir: root,
      sbomPath,
      copyArtifacts: true,
    });

    await writeFile(join(bundleDir, "sbom.cdx.json"), "tampered", "utf8");
    const verify = await verifyReleaseBundle(bundleDir);
    expect(verify.ok).toBe(false);
    expect(verify.errors.some((e) => e.includes("sha256 mismatch"))).toBe(true);
  });

  it("collect without write", async () => {
    const root = await mkdtemp(join(tmpdir(), "clawql-release-"));
    await writeFile(join(root, "package.json"), JSON.stringify({ version: "0.1.0" }), "utf8");
    gitInit(root);
    const m = await collectReleaseManifest({ rootDir: root });
    expect(m.schemaVersion).toBe("0.2");
    expect(m.leafCount).toBe(0);
    expect(m.ontologySchema).toBeUndefined();
  });

  it("pins ontologySchema when entity tree present", async () => {
    const root = await mkdtemp(join(tmpdir(), "clawql-release-ont-"));
    await writeFile(join(root, "package.json"), JSON.stringify({ version: "1.0.0" }), "utf8");
    const entDir = join(root, ".clawql", "ontology", "entities");
    const { mkdir } = await import("node:fs/promises");
    await mkdir(entDir, { recursive: true });
    await writeFile(
      join(entDir, "Thing.cqe"),
      [
        "apiVersion: clawql.dev/ontology/v1alpha1",
        "kind: Entity",
        "metadata:",
        "  name: Thing",
        "spec:",
        "  description: demo",
        "  properties:",
        "    id: { type: string, required: true }",
        "",
      ].join("\n"),
      "utf8"
    );
    gitInit(root);
    const m = await collectReleaseManifest({ rootDir: root });
    expect(m.ontologySchema?.entityCount).toBe(1);
    expect(m.ontologySchema?.sha256).toHaveLength(64);
    expect(m.leafCount).toBe(1);

    const { bundleDir } = await buildReleaseManifest({ rootDir: root, copyArtifacts: true });
    const verify = await verifyReleaseBundle(bundleDir, root);
    expect(verify.ok).toBe(true);

    await writeFile(join(entDir, "Thing.cqe"), "tampered", "utf8");
    const verifyDrift = await verifyReleaseBundle(bundleDir, root);
    expect(verifyDrift.ok).toBe(false);
    expect(verifyDrift.errors.some((e) => e.includes("ontologySchema"))).toBe(true);
  });

  it("lints .cqm manifests", async () => {
    const { lintCqmFiles } = await import("./ontology-schema.js");
    const root = await mkdtemp(join(tmpdir(), "clawql-cqm-"));
    const good = join(root, "good.cqm");
    await writeFile(
      good,
      [
        "apiVersion: clawql.dev/manifest/v1alpha1",
        "kind: EnterpriseGovernance",
        "metadata:",
        "  name: demo",
        "spec: {}",
        "",
      ].join("\n"),
      "utf8"
    );
    const ok = await lintCqmFiles([good]);
    expect(ok.ok).toBe(true);

    const bad = join(root, "bad.cqm");
    await writeFile(bad, "kind: NotAThing\n", "utf8");
    const fail = await lintCqmFiles([bad]);
    expect(fail.ok).toBe(false);
  });
});
