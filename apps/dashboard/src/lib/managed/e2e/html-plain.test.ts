import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import { stripHtmlToPlain } from "./html-plain";

describe("stripHtmlToPlain", () => {
  it("removes nested split-tag injections", async () => {
    const out = await Effect.runPromise(stripHtmlToPlain('ok <scr<script>ipt>alert(1)</script> text'));
    expect(out.toLowerCase()).not.toContain("<script");
    expect(out).toContain("ok");
    expect(out).toContain("text");
  });

  it("drops leftover angle brackets after stripping", async () => {
    const out = await Effect.runPromise(stripHtmlToPlain("a < b > c"));
    expect(out).not.toContain("<");
    expect(out).not.toContain(">");
  });
});
