import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { extractDocument } from "./extract-document.js";

const w2FixturePath = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../deployment/samples/lending-w2/fixtures/synthetic-w2.txt"
);

const titleFixturePath = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../deployment/samples/real-estate-title/fixtures/synthetic-title-commitment.txt"
);

const psaFixturePath = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../deployment/samples/real-estate-psa/fixtures/synthetic-psa.txt"
);

const fsboOfferFixturePath = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../deployment/samples/real-estate-fsbo/fixtures/synthetic-buyer-offer.txt"
);

describe("extractDocument", () => {
  it("uses local heuristic when LANGEXTRACT_BASE_URL is unset", async () => {
    const prev = process.env.LANGEXTRACT_BASE_URL;
    delete process.env.LANGEXTRACT_BASE_URL;
    try {
      const text = readFileSync(w2FixturePath, "utf8");
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

  it("extracts title commitment fields from real estate fixture", async () => {
    const prev = process.env.LANGEXTRACT_BASE_URL;
    delete process.env.LANGEXTRACT_BASE_URL;
    try {
      const text = readFileSync(titleFixturePath, "utf8");
      const result = await extractDocument({ text, schema_preset: "title_commitment" });
      expect(result.ok).toBe(true);
      expect(result.extractions?.some((e) => e.extraction_class === "property_address")).toBe(true);
      expect(result.extractions?.some((e) => e.extraction_class === "policy_amount")).toBe(true);
      expect(result.extractions?.some((e) => e.extraction_class === "schedule_b_exception")).toBe(
        true
      );
    } finally {
      if (prev === undefined) delete process.env.LANGEXTRACT_BASE_URL;
      else process.env.LANGEXTRACT_BASE_URL = prev;
    }
  });

  it("extracts PSA fields from real estate fixture", async () => {
    const prev = process.env.LANGEXTRACT_BASE_URL;
    delete process.env.LANGEXTRACT_BASE_URL;
    try {
      const text = readFileSync(psaFixturePath, "utf8");
      const result = await extractDocument({ text, schema_preset: "purchase_agreement" });
      expect(result.ok).toBe(true);
      expect(result.extractions?.some((e) => e.extraction_class === "purchase_price")).toBe(true);
      expect(result.extractions?.some((e) => e.extraction_class === "earnest_money")).toBe(true);
      expect(result.extractions?.some((e) => e.extraction_class === "closing_date")).toBe(true);
    } finally {
      if (prev === undefined) delete process.env.LANGEXTRACT_BASE_URL;
      else process.env.LANGEXTRACT_BASE_URL = prev;
    }
  });

  it("extracts FSBO buyer offer fields including contingencies", async () => {
    const prev = process.env.LANGEXTRACT_BASE_URL;
    delete process.env.LANGEXTRACT_BASE_URL;
    try {
      const text = readFileSync(fsboOfferFixturePath, "utf8");
      const result = await extractDocument({ text, schema_preset: "buyer_offer" });
      expect(result.ok).toBe(true);
      expect(result.extractions?.some((e) => e.extraction_class === "purchase_price")).toBe(true);
      expect(result.extractions?.some((e) => e.extraction_class === "financing_contingency")).toBe(
        true
      );
      expect(result.extractions?.some((e) => e.extraction_class === "inspection_contingency")).toBe(
        true
      );
      expect(result.extractions?.some((e) => e.extraction_class === "sale_of_home_contingency")).toBe(
        true
      );
    } finally {
      if (prev === undefined) delete process.env.LANGEXTRACT_BASE_URL;
      else process.env.LANGEXTRACT_BASE_URL = prev;
    }
  });
});
