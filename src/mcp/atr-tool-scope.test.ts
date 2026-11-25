import { describe, expect, it } from "vitest";
import { atrScopeFamilyForTool, decideAtrToolScope } from "./atr-tool-scope.js";

describe("atr-tool-scope (S3 / T3)", () => {
  it("maps families", () => {
    expect(atrScopeFamilyForTool("execute")).toBe("execute");
    expect(atrScopeFamilyForTool("proxy_call")).toBe("execute");
    expect(atrScopeFamilyForTool("search")).toBe("search");
    expect(atrScopeFamilyForTool("memory_recall")).toBe("memory");
    expect(atrScopeFamilyForTool("cache")).toBe("core");
    expect(atrScopeFamilyForTool("skills_list")).toBe("core");
    expect(atrScopeFamilyForTool("resume")).toBe("core");
    expect(atrScopeFamilyForTool("audit")).toBe("core");
    expect(atrScopeFamilyForTool("docs_search")).toBe("core");
    expect(atrScopeFamilyForTool("console_link")).toBe("core");
  });

  it("T3: read/passthrough natives outside core stay in their families", () => {
    expect(atrScopeFamilyForTool("data_query")).toBe("data");
    expect(atrScopeFamilyForTool("read_around")).toBe("read_around");
    expect(atrScopeFamilyForTool("inspect_pdf")).toBe("documents");
    expect(atrScopeFamilyForTool("extract_document")).toBe("documents");
  });

  it("undefined tokens allow (no ATR context)", () => {
    expect(decideAtrToolScope("execute", undefined).allow).toBe(true);
  });

  it("empty tokens deny authenticated empty scope", () => {
    const d = decideAtrToolScope("execute", []);
    expect(d.allow).toBe(false);
  });

  it("star allows all", () => {
    expect(decideAtrToolScope("sandbox_exec", ["*"]).allow).toBe(true);
  });

  it("virtual-key scopes get narrow core tools only", () => {
    const tokens = ["search"];
    expect(decideAtrToolScope("cache", tokens).allow).toBe(true);
    expect(decideAtrToolScope("skills_get", tokens).allow).toBe(true);
    expect(decideAtrToolScope("resume", tokens).allow).toBe(true);
    expect(decideAtrToolScope("search", tokens).allow).toBe(true);
    expect(decideAtrToolScope("data_query", tokens).allow).toBe(false);
    expect(decideAtrToolScope("read_around", tokens).allow).toBe(false);
    expect(decideAtrToolScope("inspect_pdf", tokens).allow).toBe(false);
    expect(decideAtrToolScope("extract_document", tokens).allow).toBe(false);
    expect(decideAtrToolScope("sandbox_exec", tokens).allow).toBe(false);
  });
});
