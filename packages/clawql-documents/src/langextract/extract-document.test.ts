import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { extractDocument } from "./extract-document.js";

const fixturePath = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../deployment/samples/lending-w2/fixtures/synthetic-w2.txt"
);

describe("extractDocument", () => {
  it("uses local heuristic when LANGEXTRACT_BASE_URL is unset", async () => {
    const prev = process.env.LANGEXTRACT_BASE_URL;
    delete process.env.LANGEXTRACT_BASE_URL;
    try {
      const text = readFileSync(fixturePath, "utf8");
      const result = await extractDocument({ text, schema_preset: "w2" });
      expect(result.ok).toBe(true);
      expect(result.extractions?.length).toBeGreaterThan(0);
      expect(result.extractions?.every((e) => e.char_interval != null)).toBe(true);
      expect(result.extractions?.some((e) => e.extraction_class === "wages")).toBe(true);
    } finally {
      if (prev === undefined) delete process.env.LANGEXTRACT_BASE_URL;
      else process.env.LANGEXTRACT_BASE_URL = prev;
    }
  });
});
