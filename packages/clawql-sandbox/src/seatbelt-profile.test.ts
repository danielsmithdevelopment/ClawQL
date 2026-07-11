import { describe, expect, it } from "vitest";
import { expandTilde, resolveSandboxPath } from "./seatbelt-paths.js";
import {
  buildAgentSeatbeltProfile,
  buildExecSeatbeltProfile,
} from "./seatbelt-profile.js";
import { defaultContainmentConfig } from "./seatbelt-config.js";

describe("seatbelt-profile", () => {
  const home = "/Users/dev";
  const config = defaultContainmentConfig({
    clawqlHome: `${home}/.ClawQL`,
    allowedPaths: [`${home}/company-work/cloned-repos`, `${home}/.ClawQL`],
  });

  it("builds deny-default agent profile with allowed and denied subpaths", () => {
    const profile = buildAgentSeatbeltProfile(config, home);
    expect(profile).toContain("(deny default)");
    expect(profile).toContain(`(subpath "${home}/company-work/cloned-repos")`);
    expect(profile).toContain(`(subpath "${home}/.ssh")`);
    expect(profile).toContain("(deny network*)");
  });

  it("builds exec profile scoped to workspace", () => {
    const ws = "/tmp/clawql-seatbelt-workspaces/s1";
    const profile = buildExecSeatbeltProfile(config, ws, home);
    expect(profile).toContain(`(subpath "${ws}")`);
    expect(profile).toContain("(deny network*)");
  });

  it("expands tilde paths", () => {
    expect(expandTilde("~/repos", home)).toBe(`${home}/repos`);
    expect(resolveSandboxPath("~/repos", home)).toBe(`${home}/repos`);
  });
});
