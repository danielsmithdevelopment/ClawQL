import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CONSOLE_UI_KIT, isManagedConsole, readConsoleSurface } from "./console-surface";

describe("console surface", () => {
  const keys = ["CLAWQL_CONSOLE_SURFACE", "NEXT_PUBLIC_CLAWQL_CONSOLE_SURFACE"] as const;
  const prev: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of keys) {
      prev[k] = process.env[k];
      delete process.env[k];
    }
  });

  afterEach(() => {
    for (const k of keys) {
      if (prev[k] === undefined) delete process.env[k];
      else process.env[k] = prev[k];
    }
  });

  it("locks the product console on shadcn (not Catalyst)", () => {
    expect(CONSOLE_UI_KIT).toBe("shadcn");
  });

  it("defaults to self-hosted", () => {
    expect(readConsoleSurface()).toBe("self-hosted");
    expect(isManagedConsole()).toBe(false);
  });

  it("treats managed / cloud as cloud.clawql.com", () => {
    expect(readConsoleSurface({ CLAWQL_CONSOLE_SURFACE: "managed" })).toBe("managed");
    expect(readConsoleSurface({ CLAWQL_CONSOLE_SURFACE: "cloud" })).toBe("managed");
    expect(isManagedConsole({ CLAWQL_CONSOLE_SURFACE: "managed" })).toBe(true);
  });
});
