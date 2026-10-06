import { describe, expect, it } from "vitest";

import { e2eEnabled } from "@/lib/managed/e2e/world";

describe("e2eEnabled", () => {
  it("requires CLAWQL_E2E_HARNESS=1", () => {
    expect(e2eEnabled({ ...process.env, CLAWQL_E2E_HARNESS: "1" })).toBe(true);
  });

  it("ignores managed console surface (no god-mode)", () => {
    // Production managed console must not enable harness paths.
    expect(e2eEnabled({ ...process.env, CLAWQL_E2E_HARNESS: undefined })).toBe(false);
    expect(e2eEnabled({ ...process.env, CLAWQL_E2E_HARNESS: "0" })).toBe(false);
    expect(
      e2eEnabled({
        ...process.env,
        CLAWQL_CONSOLE_SURFACE: "managed",
        CLAWQL_E2E_HARNESS: undefined,
      }),
    ).toBe(false);
  });
});
