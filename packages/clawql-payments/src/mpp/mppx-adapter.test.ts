import { describe, expect, it } from "vitest";
import { isMppxEnabled } from "./mppx-adapter.js";

describe("mppx adapter", () => {
  it("is disabled unless CLAWQL_MPPX_ENABLED=1", () => {
    expect(isMppxEnabled({})).toBe(false);
    expect(isMppxEnabled({ CLAWQL_MPPX_ENABLED: "1" })).toBe(true);
  });
});
