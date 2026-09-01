import { describe, expect, it } from "vitest";
import {
  extractClientFromClawqlFields,
  extractDocumentFromClawqlFields,
  extractMatterFromClawqlFields,
  parseClawqlFieldBlock,
} from "./clawql-fields.js";

describe("parseClawqlFieldBlock", () => {
  it("parses KEY=value lines and ignores fences/comments", () => {
    const raw = parseClawqlFieldBlock(`\`\`\`
# meta
CLAWQL_MATTER_ID=MAT-2401
CLAWQL_ESCROW_PCT=12
\`\`\``);
    expect(raw).toEqual({
      CLAWQL_MATTER_ID: "MAT-2401",
      CLAWQL_ESCROW_PCT: "12",
    });
  });
});

describe("extractMatterFromClawqlFields", () => {
  it("extracts B-7.1 matter fields as EXTRACTED", () => {
    const extracted = extractMatterFromClawqlFields(`
CLAWQL_MATTER_ID=MAT-2401
CLAWQL_ESCROW_PCT=12
CLAWQL_NONCOMPETE_MONTHS=24
CLAWQL_CLIENT_ID=CLT-0017
`);
    expect(extracted?.fields).toMatchObject({
      id: "MAT-2401",
      escrowPct: 12,
      nonCompeteMonths: 24,
      clientId: "CLT-0017",
    });
    expect(extracted?.fieldMeta.escrowPct?.confidence).toBe("EXTRACTED");
  });

  it("rejects invalid matter ids", () => {
    expect(
      extractMatterFromClawqlFields("CLAWQL_MATTER_ID=matter-1\nCLAWQL_ESCROW_PCT=12")
    ).toBeNull();
  });

  it("accepts Harvey LAB DMS matter ids", () => {
    const extracted = extractMatterFromClawqlFields(`
CLAWQL_MATTER_ID=1003-00001
CLAWQL_TITLE=1003-00001 — Harrowgate PE — HSR_SECOND_REQUEST
CLAWQL_PRACTICE_AREA=Other
CLAWQL_STATUS=Active
`);
    expect(extracted?.fields).toMatchObject({
      id: "1003-00001",
      title: "1003-00001 — Harrowgate PE — HSR_SECOND_REQUEST",
      practiceArea: "Other",
      status: "Active",
    });
  });
});

describe("extractClientFromClawqlFields", () => {
  it("extracts client entity when name present without matter id", () => {
    const extracted = extractClientFromClawqlFields(`
CLAWQL_CLIENT_ID=CLT-0017
CLAWQL_CLIENT_NAME=Meridian Capital
CLAWQL_TIER=Platinum
`);
    expect(extracted?.fields).toEqual({
      id: "CLT-0017",
      name: "Meridian Capital",
      tier: "Platinum",
    });
  });

  it("returns null when matter id is present (matter note, not client entity)", () => {
    expect(
      extractClientFromClawqlFields(`
CLAWQL_MATTER_ID=MAT-2401
CLAWQL_CLIENT_ID=CLT-0017
CLAWQL_CLIENT_NAME=Meridian Capital
`)
    ).toBeNull();
  });
});

describe("extractDocumentFromClawqlFields", () => {
  it("extracts document fields", () => {
    const extracted = extractDocumentFromClawqlFields(`
CLAWQL_DOCUMENT_ID=DOC-1001
CLAWQL_DOCUMENT_TITLE=Purchase Agreement
CLAWQL_MATTER_ID=MAT-2401
CLAWQL_DOCUMENT_STATUS=Executed
`);
    expect(extracted?.fields).toMatchObject({
      id: "DOC-1001",
      title: "Purchase Agreement",
      matterId: "MAT-2401",
      status: "Executed",
    });
  });
});
