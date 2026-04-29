import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getPackageRoot } from "./package-root.js";

describe("getPackageRoot", () => {
  it("returns directory that contains package.json (src/ or dist/ parent)", () => {
    const root = getPackageRoot();
    expect(existsSync(join(root, "package.json"))).toBe(true);
    expect(existsSync(join(root, "src", "package-root.ts"))).toBe(true);
  });
});
