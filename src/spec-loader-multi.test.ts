import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadSpec, resetSpecCache } from "./spec-loader.js";

const here = dirname(fileURLToPath(import.meta.url));
const petA = join(here, "test-utils/fixtures/minimal-petstore.json");
const petB = join(here, "test-utils/fixtures/minimal-widgets.json");

describe("loadSpec multi (CLAWQL_SPEC_PATHS)", () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    saved.CLAWQL_SPEC_PATH = process.env.CLAWQL_SPEC_PATH;
    saved.CLAWQL_SPEC_PATHS = process.env.CLAWQL_SPEC_PATHS;
    saved.CLAWQL_PROVIDER = process.env.CLAWQL_PROVIDER;
    delete process.env.CLAWQL_SPEC_PATH;
    delete process.env.CLAWQL_PROVIDER;
    process.env.CLAWQL_SPEC_PATHS = `${petA},${petB}`;
    resetSpecCache();
  });

  afterEach(() => {
    for (const key of Object.keys(saved)) {
      const v = saved[key as keyof typeof saved];
      if (v === undefined) delete process.env[key];
      else process.env[key] = v;
    }
    resetSpecCache();
  });

  it("merges operations with specLabel and disambiguates duplicate ids", async () => {
    const loaded = await loadSpec();
    expect(loaded.multi).toBe(true);
    expect(loaded.openapis?.length).toBe(2);
    const ids = loaded.operations.map((o) => o.id).sort();
    expect(ids).toContain("listPets");
    expect(ids.some((id) => id.includes("createWidget") || id.includes("::"))).toBe(true);
    const labels = new Set(loaded.operations.map((o) => o.specLabel));
    expect(labels.size).toBeGreaterThanOrEqual(1);
    expect(loaded.operations.some((o) => o.id === "listPets")).toBe(true);
    expect(loaded.operations.some((o) => o.id === "createWidget")).toBe(true);
    expect(loaded.operations.every((o) => o.specLabel)).toBe(true);
  });
});
