import { describe, expect, it } from "vitest";
import { seatbeltSubpathLiteral, shellDoubleQuotedLiteral } from "./seatbelt-paths.js";

describe("seatbelt path escaping", () => {
  it("escapes quotes, backslashes, and newlines for SBPL literals", () => {
    expect(seatbeltSubpathLiteral(`/tmp/a"b`)).toBe(`/tmp/a\\"b`);
    expect(seatbeltSubpathLiteral(`/tmp/a\\b`)).toBe(`/tmp/a\\\\b`);
    expect(seatbeltSubpathLiteral("/tmp/a\nb")).toBe("/tmp/a\\nb");
    expect(seatbeltSubpathLiteral("/tmp/a\rb")).toBe("/tmp/a\\rb");
    expect(seatbeltSubpathLiteral("/tmp/a\0b")).toBe("/tmp/ab");
  });

  it("shell double-quote escaping is distinct from Seatbelt escaping", () => {
    expect(shellDoubleQuotedLiteral(`/tmp/$HOME`)).toBe(`/tmp/\\$HOME`);
    expect(shellDoubleQuotedLiteral(`/tmp/\`id\``)).toBe(`/tmp/\\\`id\\\``);
    expect(shellDoubleQuotedLiteral(`/tmp/a"b`)).toBe(`/tmp/a\\"b`);
  });
});
