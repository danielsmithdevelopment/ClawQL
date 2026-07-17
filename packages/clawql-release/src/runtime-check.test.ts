import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { buildReleaseManifest } from "./manifest.js";
import {
  checkReleaseManifest,
  isReleaseManifestStrict,
  resolveReleaseManifestPathSync,
} from "./runtime-check.js";

function gitInit(dir: string): void {
  spawnSync("git", ["init"], { cwd: dir, encoding: "utf8" });
  spawnSync(
    "git",
    ["-c", "user.email=test@example.com", "-c", "user.name=Test", "add", "-A"],
    { cwd: dir, encoding: "utf8" }
  );
  spawnSync(
    "git",
    ["-c", "user.email=test@example.com", "-c", "user.name=Test", "commit", "-m", "test"],
    { cwd: dir, encoding: "utf8" }
  );
}

describe("runtime-check", () => {
  it("resolves releases/vX.Y.Z/manifest.json from version", async () => {
    const root = await mkdtemp(join(tmpdir(), "clawql-release-resolve-"));
    await writeFile(
      join(root, "package.json"),
      JSON.stringify({ name: "clawql-mcp", version: "7.0.0" }),
      "utf8"
    );
    const sbomPath = join(root, "sbom.cdx.json");
    await writeFile(sbomPath, '{"bomFormat":"CycloneDX"}', "utf8");
    gitInit(root);

    const { manifestPath } = await buildReleaseManifest({
      rootDir: root,
      tag: "v7.0.0",
      sbomPath,
      copyArtifacts: true,
    });

    const resolved = resolveReleaseManifestPathSync({
      version: "7.0.0",
      rootDir: root,
    });
    expect(resolved).toBe(manifestPath);
  });

  it("checkReleaseManifest returns ok for valid bundle", async () => {
    const root = await mkdtemp(join(tmpdir(), "clawql-release-check-"));
    await writeFile(
      join(root, "package.json"),
      JSON.stringify({ name: "clawql-mcp", version: "7.0.0" }),
      "utf8"
    );
    const sbomPath = join(root, "sbom.cdx.json");
    await writeFile(sbomPath, "{}", "utf8");
    gitInit(root);
    await buildReleaseManifest({ rootDir: root, tag: "v7.0.0", sbomPath, copyArtifacts: true });

    const check = await checkReleaseManifest({
      version: "7.0.0",
      rootDir: root,
    });
    expect(check.status).toBe("ok");
    expect(check.manifestPath).toContain("manifest.json");
  });

  it("warns when manifest missing and not required", async () => {
    const root = await mkdtemp(join(tmpdir(), "clawql-release-missing-"));
    const check = await checkReleaseManifest({
      version: "9.9.9",
      rootDir: root,
      requirePresent: false,
    });
    expect(check.status).toBe("warn");
    expect(check.message).toContain("not found");
  });

  it("fails when explicit manifest path missing and required", async () => {
    const check = await checkReleaseManifest({
      explicitPath: "/tmp/does-not-exist-clawql-manifest.json",
      requirePresent: true,
      strict: true,
    });
    expect(check.status).toBe("fail");
  });

  it("isReleaseManifestStrict respects env overrides", () => {
    const prevNode = process.env.NODE_ENV;
    const prevStrict = process.env.CLAWQL_RELEASE_MANIFEST_STRICT;
    try {
      process.env.NODE_ENV = "production";
      delete process.env.CLAWQL_RELEASE_MANIFEST_STRICT;
      expect(isReleaseManifestStrict()).toBe(true);

      process.env.CLAWQL_RELEASE_MANIFEST_STRICT = "0";
      expect(isReleaseManifestStrict()).toBe(false);

      process.env.NODE_ENV = "development";
      process.env.CLAWQL_RELEASE_MANIFEST_STRICT = "1";
      expect(isReleaseManifestStrict()).toBe(true);
    } finally {
      process.env.NODE_ENV = prevNode;
      if (prevStrict === undefined) delete process.env.CLAWQL_RELEASE_MANIFEST_STRICT;
      else process.env.CLAWQL_RELEASE_MANIFEST_STRICT = prevStrict;
    }
  });
});
