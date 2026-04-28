/**
 * Bundled Linear SDL is ~1MB — parsing may take several seconds on CI.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { loadSpec, resetSpecCache } from "./spec-loader.js";

describe("spec-loader bundled Linear (GraphQL-only)", () => {
  const keysToClear = [
    "CLAWQL_PROVIDER",
    "CLAWQL_SPEC_PATH",
    "CLAWQL_SPEC_URL",
    "CLAWQL_DISCOVERY_URL",
    "CLAWQL_SPEC_PATHS",
    "CLAWQL_BUNDLED_PROVIDERS",
    "CLAWQL_GRAPHQL_URL",
    "CLAWQL_GRAPHQL_SOURCES",
    "CLAWQL_GRPC_SOURCES",
  ] as const;

  afterEach(() => {
    for (const k of keysToClear) {
      delete process.env[k];
    }
    vi.unstubAllEnvs();
    resetSpecCache();
  });

  it("loads native GraphQL operations from bundled SDL when CLAWQL_PROVIDER=linear", async () => {
    vi.stubEnv("CLAWQL_PROVIDER", "linear");
    const loaded = await loadSpec();
    expect(loaded.operations.some((o) => o.protocolKind === "graphql")).toBe(true);
    expect(loaded.operations.some((o) => o.resource === "viewer")).toBe(true);
    expect(String(loaded.rawSource["bundledGraphqlProvider"] ?? "")).toBe("linear");
  }, 180_000);
});
