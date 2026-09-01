import { afterEach, describe, expect, it, vi } from "vitest";
import { defineProviderPlugin } from "clawql-core";
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

  it("detects blocking pre-execute hooks as enforcement", () => {
    const plugins = [
      defineProviderPlugin({
        id: "proxy",
        version: "1",
        description: "enforcing",
        hooks: [
          {
            id: "proxy:pre-execute",
            scope: "tool",
            event: "pre-execute",
            toolPattern: ".*",
            blocking: true,
            handler: () => Effect.succeed({ allow: true }),
          },
        ],
      }),
    ];
    expect(hasActiveToolEnforcement(plugins)).toBe(true);
  });

  it("treats plugins without blocking pre-execute as no enforcement", () => {
    const plugins = [
      defineProviderPlugin({
        id: "panguard-mcp-proxy",
        version: "1",
        description: "passive",
      }),
    ];
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
