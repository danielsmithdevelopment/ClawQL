import { afterEach, describe, expect, it, vi } from "vitest";
import type { Plugin } from "clawql-core";
import { Effect } from "effect";
import {
  hasActiveToolEnforcement,
  NO_ENFORCEMENT_SECURITY_WARNING,
  warnIfNoEnforcementActive,
} from "./enforcement-boot-warning.js";

describe("enforcement boot warning", () => {
  const prevAllow = process.env.CLAWQL_ALLOW_NO_ENFORCEMENT;

  afterEach(() => {
    if (prevAllow === undefined) delete process.env.CLAWQL_ALLOW_NO_ENFORCEMENT;
    else process.env.CLAWQL_ALLOW_NO_ENFORCEMENT = prevAllow;
    vi.restoreAllMocks();
  });

  it("detects active beforeCallTool as enforcement", () => {
    const plugins: Plugin[] = [
      {
        id: "proxy",
        version: "1",
        kind: "mcp-proxy",
        beforeCallTool: () => Effect.void,
      },
    ];
    expect(hasActiveToolEnforcement(plugins)).toBe(true);
  });

  it("treats passive mcp-proxy (no beforeCallTool) as no enforcement", () => {
    const plugins: Plugin[] = [{ id: "panguard-mcp-proxy", version: "1", kind: "mcp-proxy" }];
    expect(hasActiveToolEnforcement(plugins)).toBe(false);
  });

  it("writes SECURITY WARNING when no enforcement and allow flag unset", () => {
    delete process.env.CLAWQL_ALLOW_NO_ENFORCEMENT;
    const write = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const warned = warnIfNoEnforcementActive([]);
    expect(warned).toBe(true);
    expect(write).toHaveBeenCalled();
    const msg = String(write.mock.calls[0]?.[0] ?? "");
    expect(msg).toContain("SECURITY WARNING");
    expect(msg).toContain("no tool-scope enforcement");
    expect(msg).toContain(NO_ENFORCEMENT_SECURITY_WARNING.slice(0, 40));
  });

  it("stays quiet when CLAWQL_ALLOW_NO_ENFORCEMENT=1", () => {
    process.env.CLAWQL_ALLOW_NO_ENFORCEMENT = "1";
    const write = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    expect(warnIfNoEnforcementActive([])).toBe(false);
    expect(write).not.toHaveBeenCalled();
  });
});
