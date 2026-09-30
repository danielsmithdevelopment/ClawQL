import { describe, expect, it } from "vitest";
import { detectSyntheticBodyChange } from "./schedule.js";

describe("detectSyntheticBodyChange", () => {
  it("establishes baseline without change on first observation", () => {
    const first = detectSyntheticBodyChange(null, '{"ok":true}');
    expect(first.baseline).toBe(true);
    expect(first.changed).toBe(false);
    expect(first.hash).toHaveLength(64);
  });

  it("detects change when body hash differs", () => {
    const first = detectSyntheticBodyChange(null, "v1");
    const same = detectSyntheticBodyChange(first.hash, "v1");
    expect(same.changed).toBe(false);
    const next = detectSyntheticBodyChange(first.hash, "v2");
    expect(next.changed).toBe(true);
    expect(next.hash).not.toBe(first.hash);
  });
});
