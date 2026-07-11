import { describe, expect, it } from "vitest";
import { expandTilde, resolveSandboxPath } from "./seatbelt-paths.js";
import {
  buildHarnessSeatbeltProfile,
  buildExecSeatbeltProfile,
  sandboxExecArgv,
} from "./seatbelt-profile.js";
import { defaultContainmentConfig } from "./seatbelt-config.js";
import { claudeSandboxSettingsFromConfig } from "./claude-sandbox-settings.js";

describe("seatbelt-profile", () => {
  const home = "/Users/dev";
  const config = defaultContainmentConfig({
    clawqlHome: `${home}/.ClawQL`,
    workDir: `${home}/company-work/cloned-repos/my-app`,
    allowedPaths: [`${home}/company-work/cloned-repos`, `${home}/.ClawQL`],
  });

  it("builds parameterized harness profile with deny file-write default", () => {
    const profile = buildHarnessSeatbeltProfile(config, "codex");
    expect(profile).toContain('(param "WORK_DIR")');
    expect(profile).toContain('(param "CLAWQL_DIR")');
    expect(profile).toContain('(param "HOME_SSH")');
    expect(profile).toContain("(deny file-write*)");
    expect(profile).toContain("; ClawQL harness profile: codex");
  });

  it("builds exec profile with workspace subpath", () => {
    const ws = "/tmp/clawql-seatbelt-workspaces/s1";
    const profile = buildExecSeatbeltProfile(config, ws);
    expect(profile).toContain(`(subpath "${ws}")`);
    expect(profile).toContain('(param "WORK_DIR")');
  });

  it("sandboxExecArgv passes -D params before command", () => {
    const argv = sandboxExecArgv("/p.sb", { WORK_DIR: "/repo", CLAWQL_DIR: "/cq" }, "codex", ["--help"]);
    expect(argv).toEqual(["-f", "/p.sb", "-D", "WORK_DIR=/repo", "-D", "CLAWQL_DIR=/cq", "--", "codex", "--help"]);
  });

  it("expands tilde paths", () => {
    expect(expandTilde("~/repos", home)).toBe(`${home}/repos`);
    expect(resolveSandboxPath("~/repos", home)).toBe(`${home}/repos`);
  });

  it("claude settings restrict to clawql home and work dir", () => {
    const settings = claudeSandboxSettingsFromConfig(config, `${home}/company-work/cloned-repos/my-app`);
    expect(settings.sandbox.enabled).toBe(true);
    expect(settings.sandbox.allowedPaths.some((p) => p.includes(".ClawQL"))).toBe(true);
    expect(settings.sandbox.deniedPaths).toContain("~/.ssh");
  });
});
