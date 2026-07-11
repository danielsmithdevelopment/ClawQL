import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  hasNativeProtocolEnv,
  isNativeProtocolsOnlyEnabled,
  parseGraphQLSourcesEnv,
  shouldLoadNativeProtocolsOnlyMode,
  wantsOpenAPISpecSelectionEnv,
} from "clawql-api";

describe("native-protocol-env", () => {
  const saved = { ...process.env };

  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    process.env = { ...saved };
  });

  it("CLAWQL_GRAPHQL_URL mirrors single-endpoint discovery without JSON array", () => {
    vi.stubEnv("CLAWQL_GRAPHQL_URL", "https://api.linear.app/graphql");
    vi.stubEnv("CLAWQL_GRAPHQL_NAME", "linear");
    vi.stubEnv("CLAWQL_GRAPHQL_HEADERS", JSON.stringify({ Authorization: "Bearer token" }));
    const configs = parseGraphQLSourcesEnv();
    expect(configs).toHaveLength(1);
    expect(configs[0]?.name).toBe("linear");
    expect(configs[0]?.endpoint).toBe("https://api.linear.app/graphql");
    expect(configs[0]?.headers?.Authorization).toBe("Bearer token");
  });

  it("does not auto-enter native-only mode when only CLAWQL_GRAPHQL_URL is set", () => {
    vi.stubEnv("CLAWQL_GRAPHQL_URL", "https://api.linear.app/graphql");
    expect(wantsOpenAPISpecSelectionEnv()).toBe(false);
    expect(hasNativeProtocolEnv()).toBe(true);
    expect(isNativeProtocolsOnlyEnabled()).toBe(false);
    expect(shouldLoadNativeProtocolsOnlyMode()).toBe(false);
  });

  it("enters native-only mode only when CLAWQL_NATIVE_PROTOCOLS_ONLY=1 and no OpenAPI env", () => {
    vi.stubEnv("CLAWQL_GRAPHQL_URL", "https://api.linear.app/graphql");
    vi.stubEnv("CLAWQL_NATIVE_PROTOCOLS_ONLY", "1");
    expect(wantsOpenAPISpecSelectionEnv()).toBe(false);
    expect(hasNativeProtocolEnv()).toBe(true);
    expect(shouldLoadNativeProtocolsOnlyMode()).toBe(true);
  });

  it("does not use native-only mode when CLAWQL_PROVIDER is set", () => {
    vi.stubEnv("CLAWQL_GRAPHQL_URL", "https://api.linear.app/graphql");
    vi.stubEnv("CLAWQL_NATIVE_PROTOCOLS_ONLY", "1");
    vi.stubEnv("CLAWQL_PROVIDER", "github");
    expect(wantsOpenAPISpecSelectionEnv()).toBe(true);
    expect(shouldLoadNativeProtocolsOnlyMode()).toBe(false);
  });

  it("drops missing schemaPath from CLAWQL_GRAPHQL_SOURCES and falls back to introspection", () => {
    vi.stubEnv(
      "CLAWQL_GRAPHQL_SOURCES",
      JSON.stringify([
        {
          name: "myapi",
          endpoint: "https://api.example.com/graphql",
          schemaPath: "/definitely/missing/schema.graphql",
        },
      ])
    );
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const configs = parseGraphQLSourcesEnv();
    err.mockRestore();
    expect(configs).toHaveLength(1);
    expect(configs[0]?.schemaPath).toBeUndefined();
    expect(configs[0]?.endpoint).toBe("https://api.example.com/graphql");
  });
});
