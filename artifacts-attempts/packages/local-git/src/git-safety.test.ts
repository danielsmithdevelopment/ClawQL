import { describe, expect, it } from "vitest";
import { assertSafeName, gitClone } from "./git.js";

describe("git safety", () => {
  it("rejects option-like repo names", () => {
    expect(() => assertSafeName("--upload-pack=evil")).toThrow(/unsafe/);
    expect(() => assertSafeName("-foo")).toThrow(/unsafe/);
    expect(() => assertSafeName("../escape")).toThrow(/unsafe/);
  });

  it("accepts attempt fork names", () => {
    expect(assertSafeName("tsk_demo-att_1")).toBe("tsk_demo-att_1");
  });

  it("gitClone puts paths after --", () => {
    // smoke: function exists and rejects dash sources without running git
    expect(() => gitClone("/tmp", "-e", "/tmp/x")).toThrow(/must not start/);
  });
});
