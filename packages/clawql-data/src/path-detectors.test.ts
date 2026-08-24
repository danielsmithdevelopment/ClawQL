import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  detectCreditFromRelPaths,
  detectHsrFromRelPaths,
  detectHsrSecondRequest,
} from "./path-detectors.js";
import { ClawqlDataStore, resetClawqlDataStoreForTests } from "./store.js";
import "./engines/duckdb/index.js";

describe("path detectors", () => {
  it("flags HSR from second-request filenames", () => {
    const hit = detectHsrFromRelPaths([
      "Memos/second-request-strategy-memo.docx",
      "Engagement/engagement-letter.docx",
    ]);
    expect(hit.received).toBe(true);
    expect(hit.proofDoc).toContain("second-request");
  });

  it("ignores preparation second-request filenames", () => {
    const hit = detectHsrFromRelPaths(["Drafts/second-request-preparation-checklist.docx"]);
    expect(hit.received).toBe(false);
  });

  it("flags credit from execution credit-agreement paths", () => {
    const hit = detectCreditFromRelPaths([
      "Transaction Documents/credit-agreement-execution.docx",
      "Correspondence/cover.eml",
    ]);
    expect(hit.isCreditFacility).toBe(true);
    expect(hit.practiceArea).toBe("Banking & Finance");
  });

  it("detects defined-term Second Request in docx", async () => {
    const dir = await mkdtemp(join(tmpdir(), "clawql-hsr-def-"));
    const corr = join(dir, "Correspondence");
    await mkdir(corr, { recursive: true });
    // Minimal OOXML with defined-term phrase
    const { zipSync } = await import("fflate");
    const xml = `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:t>DOJ issued a request (the "Second Request") on May 8.</w:t></w:p></w:body></w:document>`;
    const bytes = zipSync({
      "word/document.xml": new TextEncoder().encode(xml),
      "[Content_Types].xml": new TextEncoder().encode(
        '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"></Types>'
      ),
    });
    await writeFile(join(corr, "joint-status-report.docx"), bytes);
    const det = await detectHsrSecondRequest(dir);
    expect(det.received).toBe(true);
    expect(det.proofDoc).toContain("joint-status-report");
  });
});

describe("mattersRoot ingest sets HSR/credit bools", () => {
  afterEach(async () => {
    await resetClawqlDataStoreForTests();
  });

  it("ingests filename HSR + credit from a tiny DMS tree", async () => {
    const root = await mkdtemp(join(tmpdir(), "clawql-dms-"));
    const hsrDir = join(root, "1003-00001");
    const creditDir = join(root, "1012-00001");
    await mkdir(join(hsrDir, "Memos"), { recursive: true });
    await mkdir(join(creditDir, "Transaction Documents"), { recursive: true });
    await writeFile(join(hsrDir, "Memos", "second-request-strategy-memo.docx"), "pk");
    await writeFile(
      join(creditDir, "Transaction Documents", "credit-agreement-execution.docx"),
      "pk"
    );

    const dbDir = await mkdtemp(join(tmpdir(), "clawql-data-db-"));
    const store = new ClawqlDataStore({
      CLAWQL_DATA_PATH: join(dbDir, "matters.duckdb"),
      CLAWQL_DATA_ENGINE: "duckdb",
      CLAWQL_DATA_INGEST_ROOTS: root,
    });
    const ingest = await store.ingest({ replace: true, mattersRoot: root });
    expect(ingest.ok).toBe(true);
    expect(ingest.matterCount).toBe(2);

    const hsr = await store.query(
      "SELECT matter_id FROM matters WHERE is_hsr_second_request ORDER BY matter_id"
    );
    expect(hsr.ok).toBe(true);
    expect(hsr.rows?.map((r) => r.matter_id)).toEqual(["1003-00001"]);

    const credit = await store.query(
      "SELECT matter_id FROM matters WHERE is_credit_facility ORDER BY matter_id"
    );
    expect(credit.ok).toBe(true);
    expect(credit.rows?.map((r) => r.matter_id)).toEqual(["1012-00001"]);
    await store.close();
  });
});
