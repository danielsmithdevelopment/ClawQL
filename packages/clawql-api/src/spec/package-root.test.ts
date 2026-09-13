import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getPackageRoot } from "clawql-api";

describe("getPackageRoot", () => {
  it("returns ClawQL repo root (contains providers/ and package.json)", () => {
    const root = getPackageRoot();
    expect(existsSync(join(root, "package.json"))).toBe(true);
    expect(existsSync(join(root, "providers"))).toBe(true);
  });
});
