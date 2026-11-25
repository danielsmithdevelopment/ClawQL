import { describe, expect, it } from "vitest";
import { validateReadonlySelect } from "./sql-guard.js";

describe("validateReadonlySelect", () => {
  it("allows SELECT / WITH", () => {
    expect(validateReadonlySelect("SELECT 1")).toBe("SELECT 1");
    expect(validateReadonlySelect("WITH x AS (SELECT 1) SELECT * FROM x")).toContain("WITH");
  });

  it("rejects writes and multi-statement", () => {
    expect(() => validateReadonlySelect("INSERT INTO matters VALUES (1)")).toThrow(/read-only/);
    expect(() => validateReadonlySelect("SELECT 1; SELECT 2")).toThrow(/single/);
    expect(() => validateReadonlySelect("DROP TABLE matters")).toThrow(/read-only/);
  });

  it("rejects host file and URL scans (4.02)", () => {
    expect(() => validateReadonlySelect("SELECT * FROM read_text('/etc/passwd')")).toThrow(
      /host files|remote URLs/
    );
    expect(() => validateReadonlySelect("SELECT * FROM glob('/**')")).toThrow(
      /host files|remote URLs/
    );
    expect(() => validateReadonlySelect("SELECT * FROM 'https://example.com/x'")).toThrow(
      /host files|remote URLs/
    );
  });
});
