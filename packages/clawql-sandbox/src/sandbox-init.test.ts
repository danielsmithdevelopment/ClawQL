import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runSandboxInit } from "./sandbox-init.js";

describe("sandbox-init", () => {
  it("writes config, profiles, and wrapper", async () => {
    const base = await mkdtemp(join(tmpdir(), "clawql-sandbox-init-"));
    const clawqlHome = join(base, ".ClawQL");
    const result = await runSandboxInit({
      clawqlHome,
      allowedPaths: [join(base, "repos")],
      skipVerify: true,
    });

    expect(result.config.enabled).toBe(true);
    expect(result.config.failClosed).toBe(true);

    const configRaw = await readFile(result.paths.configPath, "utf8");
    expect(configRaw).toContain('"failClosed": true');

    const agentProfile = await readFile(result.paths.agentProfilePath, "utf8");
    expect(agentProfile).toContain("(deny default)");

    const wrapper = await readFile(result.paths.wrapperPath, "utf8");
    expect(wrapper).toContain("sandbox-exec");
  });
});
