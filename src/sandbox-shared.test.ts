import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  defaultPersistence,
  parseTimeoutMs,
  resolveSandboxId,
  snippetFilename,
} from "./sandbox-shared.js";

describe("sandbox-shared", () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    saved.CLAWQL_SANDBOX_PERSISTENCE_MODE = process.env.CLAWQL_SANDBOX_PERSISTENCE_MODE;
    saved.CLAWQL_SANDBOX_TIMEOUT_MS = process.env.CLAWQL_SANDBOX_TIMEOUT_MS;
    saved.CLAWQL_SANDBOX_TIMEOUT_MS_MAX = process.env.CLAWQL_SANDBOX_TIMEOUT_MS_MAX;
    delete process.env.CLAWQL_SANDBOX_PERSISTENCE_MODE;
    delete process.env.CLAWQL_SANDBOX_TIMEOUT_MS;
    delete process.env.CLAWQL_SANDBOX_TIMEOUT_MS_MAX;
  });

  afterEach(() => {
    for (const k of Object.keys(saved)) {
      const v = saved[k];
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it("defaultPersistence returns session when unset", () => {
    expect(defaultPersistence()).toBe("session");
  });

  it("defaultPersistence respects CLAWQL_SANDBOX_PERSISTENCE_MODE", () => {
    process.env.CLAWQL_SANDBOX_PERSISTENCE_MODE = "ephemeral";
    expect(defaultPersistence()).toBe("ephemeral");
    process.env.CLAWQL_SANDBOX_PERSISTENCE_MODE = "persistent";
    expect(defaultPersistence()).toBe("persistent");
  });

  it("parseTimeoutMs clamps to [1000, max] and uses env defaults", () => {
    process.env.CLAWQL_SANDBOX_TIMEOUT_MS_MAX = "5000";
    process.env.CLAWQL_SANDBOX_TIMEOUT_MS = "2000";
    expect(parseTimeoutMs(undefined)).toBe(2000);
    expect(parseTimeoutMs(500)).toBe(1000);
    expect(parseTimeoutMs(999_000)).toBe(5000);
  });

  it("parseTimeoutMs falls back when env invalid", () => {
    process.env.CLAWQL_SANDBOX_TIMEOUT_MS_MAX = "not-a-number";
    process.env.CLAWQL_SANDBOX_TIMEOUT_MS = "also-bad";
    expect(parseTimeoutMs(undefined)).toBe(120000);
  });

  it("resolveSandboxId varies by persistence mode", () => {
    const eph = resolveSandboxId("ephemeral", "sid");
    expect(eph).toMatch(/^ephemeral-/);
    expect(resolveSandboxId("persistent", undefined)).toBe("clawql-persistent");
    expect(resolveSandboxId("session", "  my  ")).toBe("session-my");
    expect(resolveSandboxId("session", undefined)).toBe("session-default");
  });

  it("snippetFilename maps languages", () => {
    expect(snippetFilename("python")).toBe("clawql_snippet.py");
    expect(snippetFilename("javascript")).toBe("clawql_snippet.mjs");
    expect(snippetFilename("shell")).toBe("clawql_snippet.sh");
  });
});
