import { describe, expect, it } from "vitest";
import { onboardExitCode, type OnboardResult } from "./onboard.js";

describe("onboardExitCode", () => {
  it("returns 0 when all steps pass", () => {
    const result: OnboardResult = {
      steps: [
        { name: "init", ok: true },
        { name: "mcp-config", ok: true },
        { name: "smoke:search", ok: true },
      ],
      home: "/tmp/.ClawQL",
      providersVault: "/tmp/.ClawQL/vault/providers.json",
      doctorFailed: false,
    };
    expect(onboardExitCode(result)).toBe(0);
  });

  it("returns 1 when init fails", () => {
    const result: OnboardResult = {
      steps: [{ name: "init", ok: false, detail: "disk full" }],
      home: "",
      providersVault: "",
      doctorFailed: true,
    };
    expect(onboardExitCode(result)).toBe(1);
  });

  it("returns 1 when smoke fails", () => {
    const result: OnboardResult = {
      steps: [
        { name: "init", ok: true },
        { name: "smoke:tools/list", ok: false },
      ],
      home: "/tmp",
      providersVault: "/tmp/vault/providers.json",
      doctorFailed: true,
    };
    expect(onboardExitCode(result)).toBe(1);
  });
});
