import { describe, expect, it } from "vitest";
import { callMacosSeatbeltSandbox } from "./sandbox-macos-seatbelt.js";

describe("sandbox-macos-seatbelt", () => {
  it("rejects non-darwin platforms", async () => {
    if (process.platform === "darwin") {
      expect(true).toBe(true);
      return;
    }
    const r = await callMacosSeatbeltSandbox({ code: "print(1)", language: "python" });
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/macOS/);
  });
});
