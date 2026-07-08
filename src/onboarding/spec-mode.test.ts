import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { inferSpecMode } from "./spec-mode.js";

describe("inferSpecMode", () => {
  const env = process.env;

  beforeEach(() => {
    process.env = { ...env };
    delete process.env.CLAWQL_SPEC_PATH;
    delete process.env.CLAWQL_SPEC_URL;
    delete process.env.CLAWQL_DISCOVERY_URL;
    delete process.env.CLAWQL_SPEC_PATHS;
    delete process.env.CLAWQL_BUNDLED_PROVIDERS;
    delete process.env.CLAWQL_PROVIDER;
  });

  afterEach(() => {
    process.env = env;
  });

  it("returns default stack when no spec env is set", () => {
    expect(inferSpecMode()).toContain("default stack");
  });

  it("detects single-spec mode", () => {
    process.env.CLAWQL_SPEC_PATH = "/tmp/openapi.yaml";
    expect(inferSpecMode()).toBe("single-spec");
  });

  it("detects CLAWQL_PROVIDER", () => {
    process.env.CLAWQL_PROVIDER = "github,slack";
    expect(inferSpecMode()).toBe("CLAWQL_PROVIDER=github,slack");
  });
});
