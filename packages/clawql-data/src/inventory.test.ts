import { mkdtemp, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  catalogMatterFiles,
  detectCapitalMarkets,
  extractKeyTermsFromText,
  inferDocType,
} from "./inventory.js";

describe("inferDocType", () => {
  it("classifies lock-up, DIP, withdrawal, credit, and other", () => {
    expect(inferDocType("Offering/docs", "form-of-lock-up-agreement.docx")).toBe("lock-up-agreement");
    expect(inferDocType("x", "lockup-period-memo.docx")).toBe("lock-up-agreement");
    expect(inferDocType("Restructuring/DIP", "dip-financing-order.docx")).toBe("dip-financing");
    expect(inferDocType("docs/debtor-in-possession", "motion.docx")).toBe("dip-financing");
    expect(inferDocType("Offering", "notice-of-withdrawal.docx")).toBe("withdrawal-notice");
    expect(inferDocType("Transaction Documents", "credit-agreement-execution.docx")).toBe(
      "credit-agreement"
    );
    expect(inferDocType("Correspondence", "cover-email.txt")).toBe("other");
  });

  it("treats HSR withdrawal letters as hsr-filing, not CM withdrawal", () => {
    expect(inferDocType("HSR Filing", "hsr-withdrawal-letter.docx")).toBe("hsr-filing");
  });
});

describe("extractKeyTermsFromText", () => {
  it("extracts 180-day lock-up", () => {
    const terms = extractKeyTermsFromText(
      "The lock-up period is 180 days following the effective date of the registration statement.",
      { docType: "lock-up-agreement", filename: "form-of-lock-up.docx" }
    );
    expect(terms.lock_up_period_days).toBe(180);
    expect(terms.lock_up_period).toBe("180 days");
  });

  it("extracts offering pulled at launch date", () => {
    const terms = extractKeyTermsFromText(
      "The offering was pulled at launch on June 28, 2022 after the book failed to build.",
      { docType: "other", filename: "termination-memo.docx" }
    );
    expect(terms.offering_status).toBe("withdrawn");
    expect(terms.withdrawal_date).toBe("2022-06-28");
  });

  it("does not mark hypothetical engagement withdrawal language", () => {
    const terms = extractKeyTermsFromText(
      "In the event the Offering does not close — including a decision by the Company to withdraw the Offering — fees may apply.",
      { docType: "offering-document", filename: "engagement-letter.docx" }
    );
    expect(terms.offering_status).not.toBe("withdrawn");
  });

  it("does not mark unilaterally terminated the offering", () => {
    const terms = extractKeyTermsFromText(
      "Meridian Hale could unilaterally terminated the offering under Section 9 without further obligation.",
      {
        docType: "offering-document",
        filename: "underwriting-agreement-key-terms-memo.docx",
      }
    );
    expect(terms.offering_status).not.toBe("withdrawn");
  });

  it("extracts hyphenated 180-day lock-up", () => {
    const terms = extractKeyTermsFromText("Investors agree to a 180-day lock-up.", {
      docType: "lock-up-agreement",
      filename: "form-of-lock-up-agreement.docx",
    });
    expect(terms.lock_up_period_days).toBe(180);
  });
});

describe("detectCapitalMarkets", () => {
  it("does not treat generic transaction documents as Capital Markets", () => {
    const hit = detectCapitalMarkets(["Transaction Documents/credit-agreement-execution.docx"]);
    expect(hit.practice_area).toBeNull();
  });

  it("flags lock-up / offering paths", () => {
    const hit = detectCapitalMarkets(["Offering/form-of-lock-up-agreement.docx"]);
    expect(hit.practice_area).toBe("Capital Markets");
  });
});

describe("catalogMatterFiles", () => {
  it("walks a temp matter tree", async () => {
    const tmp = await mkdtemp(join(tmpdir(), "clawql-data-inv-"));
    const matter = join(tmp, "1010-00002");
    await mkdir(join(matter, "Offering"), { recursive: true });
    await writeFile(join(matter, "Offering", "form-of-lock-up-agreement.docx"), "PK");
    await writeFile(join(matter, "notes.txt"), "hello");
    await writeFile(join(matter, "photo.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    const rows = await catalogMatterFiles(matter);
    const rels = new Set(rows.map((r) => r.rel_path));
    expect(rels.has("Offering/form-of-lock-up-agreement.docx")).toBe(true);
    expect(rels.has("notes.txt")).toBe(true);
    expect(rels.has("photo.png")).toBe(true);
    const lock = rows.find((r) => r.filename === "form-of-lock-up-agreement.docx");
    expect(lock?.doc_type).toBe("lock-up-agreement");
    expect(lock?.ext).toBe("docx");
  });
});
