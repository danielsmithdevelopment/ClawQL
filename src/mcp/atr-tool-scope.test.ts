import { describe, expect, it } from "vitest";
import { atrScopeFamilyForTool, decideAtrToolScope } from "./atr-tool-scope.js";

describe("atr-tool-scope (S3)", () => {
  it("maps families", () => {
    expect(atrScopeFamilyForTool("execute")).toBe("execute");
    expect(atrScopeFamilyForTool("proxy_call")).toBe("execute");
    expect(atrScopeFamilyForTool("search")).toBe("search");
    expect(atrScopeFamilyForTool("memory_recall")).toBe("memory");
    expect(atrScopeFamilyForTool("cache")).toBe("core");
    expect(atrScopeFamilyForTool("skills_list")).toBe("core");
    expect(atrScopeFamilyForTool("resume")).toBe("core");
    expect(atrScopeFamilyForTool("audit")).toBe("core");
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

  it("virtual-key scopes get core passthrough tools", () => {
    const tokens = ["execute", "search", "memory"];
    expect(decideAtrToolScope("cache", tokens).allow).toBe(true);
    expect(decideAtrToolScope("skills_get", tokens).allow).toBe(true);
    expect(decideAtrToolScope("resume", tokens).allow).toBe(true);
    expect(decideAtrToolScope("execute", tokens).allow).toBe(true);
    expect(decideAtrToolScope("sandbox_exec", tokens).allow).toBe(false);
  });
});
