import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runSandboxInit } from "./sandbox-init.js";
import { SANDBOX_HARNESS_IDS } from "./seatbelt-config.js";

describe("sandbox-init", () => {
  it("writes per-harness profiles and config", async () => {
    const base = await mkdtemp(join(tmpdir(), "clawql-sandbox-init-"));
    const clawqlHome = join(base, ".ClawQL");
    const workDir = join(base, "repos", "my-app");
    const result = await runSandboxInit({
      clawqlHome,
      workDir,
      allowedPaths: [join(base, "repos")],
      skipVerify: true,
    });

    expect(result.config.enabled).toBe(true);
    expect(result.config.failClosed).toBe(true);

    for (const h of SANDBOX_HARNESS_IDS) {
      const profile = await readFile(result.harnessProfiles[h], "utf8");
      expect(profile).toContain(`harness profile: ${h}`);
      expect(profile).toContain('(param "WORK_DIR")');
    }

    const configRaw = await readFile(result.paths.configPath, "utf8");
    expect(configRaw).toContain('"failClosed": true');
  });
});
