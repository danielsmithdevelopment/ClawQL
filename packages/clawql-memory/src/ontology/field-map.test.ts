import { describe, expect, it } from "vitest";
import {
  camelToSnake,
  matterFieldsFromSqlRow,
  MATTER_FILTER_COLUMNS,
  snakeToCamel,
} from "./field-map.js";

describe("field-map", () => {
  it("is bidirectional for B-7.1 filter fields", () => {
    for (const camel of [
      "escrowPct",
      "nonCompeteMonths",
      "dealValueUSD",
      "escrowDurationMonths",
      "practiceArea",
      "clientId",
    ]) {
      expect(snakeToCamel(camelToSnake(camel))).toBe(camel);
    }
  });

  it("maps filter fields to SQL columns", () => {
    expect(MATTER_FILTER_COLUMNS.escrowPct).toBe("m.escrow_pct");
    expect(MATTER_FILTER_COLUMNS.nonCompeteMonths).toBe("m.non_compete_months");
    expect(MATTER_FILTER_COLUMNS.client).toBe("m.client_id");
  });

  it("hydrates camelCase Matter fields from SQL rows", () => {
    const fields = matterFieldsFromSqlRow({
      id: "MAT-2401",
      escrow_pct: 12,
      non_compete_months: 24,
      client_id: "CLT-0017",
      vault_note_path: "Memory/MAT-2401.md",
    });
    expect(fields).toMatchObject({
      id: "MAT-2401",
      escrowPct: 12,
      nonCompeteMonths: 24,
      clientId: "CLT-0017",
      vaultNotePath: "Memory/MAT-2401.md",
    });
  });
});
