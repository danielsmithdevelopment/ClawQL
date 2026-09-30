import { describe, expect, it } from "vitest";
import { detectProjectedChange, detectSyntheticBodyChange } from "./schedule.js";

describe("detectSyntheticBodyChange (compat)", () => {
  it("establishes baseline without change on first observation", () => {
    const first = detectSyntheticBodyChange(null, '{"ok":true}');
    expect(first.baseline).toBe(true);
    expect(first.changed).toBe(false);
    expect(first.hash).toHaveLength(64);
  });

  it("detects change when projected body hash differs", () => {
    const first = detectSyntheticBodyChange(null, "v1");
    const same = detectSyntheticBodyChange(first.hash, "v1");
    expect(same.changed).toBe(false);
    const next = detectSyntheticBodyChange(first.hash, "v2");
    expect(next.changed).toBe(true);
    expect(next.hash).not.toBe(first.hash);
  });

  it("does not fire on volatile-only JSON churn without watch_fields", () => {
    const a = JSON.stringify({ ok: true, request_id: "1", generated_at: "t1" });
    const b = JSON.stringify({ ok: true, request_id: "2", generated_at: "t2" });
    const first = detectProjectedChange({
      previousHash: null,
      previousProjectionJson: null,
      responseBody: a,
      config: undefined,
    });
    const second = detectProjectedChange({
      previousHash: first.hash,
      previousProjectionJson: JSON.stringify(first.projection),
      responseBody: b,
      config: undefined,
    });
    expect(second.changed).toBe(false);
  });
});
