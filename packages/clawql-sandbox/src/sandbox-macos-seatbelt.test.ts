import { describe, expect, it } from "vitest";
import { callMacosSeatbeltSandbox } from "./macos-seatbelt.js";

describe("sandbox-macos-seatbelt", () => {
  it.skipIf(process.platform === "darwin")("rejects non-darwin platforms", async () => {
    const r = await callMacosSeatbeltSandbox({ code: "print(1)", language: "python" });
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/macOS/);
  });
});
