import { describe, expect, it } from "vitest";
import { assertSafeName, gitClone, sanitizeGitArgs } from "./git.js";

describe("git safety", () => {
  it("rejects option-like repo names", () => {
    expect(() => assertSafeName("--upload-pack=evil")).toThrow(/unsafe/);
    expect(() => assertSafeName("-foo")).toThrow(/unsafe/);
    expect(() => assertSafeName("../escape")).toThrow(/unsafe/);
  });

  it("accepts attempt fork names", () => {
    expect(assertSafeName("tsk_demo-att_1")).toBe("tsk_demo-att_1");
  });

  it("sanitizeGitArgs rejects --upload-pack via DoubleDash guard", () => {
    expect(() => sanitizeGitArgs(["clone", "--upload-pack=evil", "a", "b"])).toThrow(/starts with --/);
    expect(sanitizeGitArgs(["clone", "--mirror", "--", "/tmp/a.git", "/tmp/b"])).toEqual([
      "clone",
      "--mirror",
      "--",
      "/tmp/a.git",
      "/tmp/b",
    ]);
  });

  it("gitClone puts paths after --", () => {
    expect(() => gitClone("/tmp", "-e", "/tmp/x")).toThrow(/must not start/);
  });
});
