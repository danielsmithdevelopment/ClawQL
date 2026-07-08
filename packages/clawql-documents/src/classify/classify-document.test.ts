import { describe, expect, it } from "vitest";

import { classifyDocument } from "./classify-document.js";

describe("classifyDocument", () => {
  it("uses local heuristic when CLASSIFIER_BASE_URL is unset", async () => {
    const prev = process.env.CLASSIFIER_BASE_URL;
    delete process.env.CLASSIFIER_BASE_URL;
    try {
      const result = await classifyDocument({
        docling_md: "# Form W-2 Wage and Tax Statement",
      });
      expect(result.ok).toBe(true);
      expect(result.label).toBe("w2");
      expect(result.confidence).toBeGreaterThan(0.9);
      expect(result.needs_hitl).toBe(false);
    } finally {
      if (prev === undefined) delete process.env.CLASSIFIER_BASE_URL;
      else process.env.CLASSIFIER_BASE_URL = prev;
    }
  });

  it("flags needs_hitl when confidence is below threshold", async () => {
    const prevUrl = process.env.CLASSIFIER_BASE_URL;
    const prevMin = process.env.CLASSIFIER_MIN_CONFIDENCE;
    delete process.env.CLASSIFIER_BASE_URL;
    process.env.CLASSIFIER_MIN_CONFIDENCE = "0.99";
    try {
      const result = await classifyDocument({
        text: "random invoice without tax form markers",
      });
      expect(result.ok).toBe(true);
      expect(result.needs_hitl).toBe(true);
    } finally {
      if (prevUrl === undefined) delete process.env.CLASSIFIER_BASE_URL;
      else process.env.CLASSIFIER_BASE_URL = prevUrl;
      if (prevMin === undefined) delete process.env.CLASSIFIER_MIN_CONFIDENCE;
      else process.env.CLASSIFIER_MIN_CONFIDENCE = prevMin;
    }
  });

  it("classifies title commitments for real estate vertical", async () => {
    const prev = process.env.CLASSIFIER_BASE_URL;
    delete process.env.CLASSIFIER_BASE_URL;
    try {
      const result = await classifyDocument({
        docling_md: "# ALTA COMMITMENT FOR TITLE INSURANCE\nSchedule B — Exceptions",
      });
      expect(result.ok).toBe(true);
      expect(result.label).toBe("title_commitment");
      expect(result.confidence).toBeGreaterThan(0.9);
    } finally {
      if (prev === undefined) delete process.env.CLASSIFIER_BASE_URL;
      else process.env.CLASSIFIER_BASE_URL = prev;
    }
  });

  it("classifies purchase agreements for real estate vertical", async () => {
    const prev = process.env.CLASSIFIER_BASE_URL;
    delete process.env.CLASSIFIER_BASE_URL;
    try {
      const result = await classifyDocument({
        text: "RESIDENTIAL PURCHASE AND SALE AGREEMENT\nPurchase Price: $485,000.00",
      });
      expect(result.ok).toBe(true);
      expect(result.label).toBe("purchase_agreement");
    } finally {
      if (prev === undefined) delete process.env.CLASSIFIER_BASE_URL;
      else process.env.CLASSIFIER_BASE_URL = prev;
    }
  });

  it("classifies FSBO buyer offers before generic purchase agreement", async () => {
    const prev = process.env.CLASSIFIER_BASE_URL;
    delete process.env.CLASSIFIER_BASE_URL;
    try {
      const result = await classifyDocument({
        text: "OFFER TO PURCHASE — FSBO\nPurchase Price: $478,000.00",
      });
      expect(result.ok).toBe(true);
      expect(result.label).toBe("buyer_offer");
      expect(result.confidence).toBeGreaterThan(0.85);
    } finally {
      if (prev === undefined) delete process.env.CLASSIFIER_BASE_URL;
      else process.env.CLASSIFIER_BASE_URL = prev;
    }
  });
});
