import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  hasCustomProviderEnv,
  parseGraphQLSourcesEnv,
  resolveBundledGraphqlFromCustomEnv,
  shouldLoadCustomProvidersOnly,
  wantsOpenAPISpecSelectionEnv,
} from "clawql-api";

describe("custom provider env", () => {
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

  it("loads only configured custom providers when CLAWQL_GRAPHQL_URL is set without CLAWQL_PROVIDER", () => {
    vi.stubEnv("CLAWQL_GRAPHQL_URL", "https://api.linear.app/graphql");
    expect(wantsOpenAPISpecSelectionEnv()).toBe(false);
    expect(hasCustomProviderEnv()).toBe(true);
    expect(shouldLoadCustomProvidersOnly()).toBe(true);
  });

  it("does not load custom-provider-only mode when CLAWQL_PROVIDER is set", () => {
    vi.stubEnv("CLAWQL_GRAPHQL_URL", "https://api.linear.app/graphql");
    vi.stubEnv("CLAWQL_PROVIDER", "github");
    expect(wantsOpenAPISpecSelectionEnv()).toBe(true);
    expect(shouldLoadCustomProvidersOnly()).toBe(false);
  });

  it("drops missing schemaPath from CLAWQL_GRAPHQL_SOURCES and tries introspection instead", () => {
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

  it("routes a lone Linear endpoint to the bundled linear provider", () => {
    vi.stubEnv("CLAWQL_GRAPHQL_URL", "https://api.linear.app/graphql");
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const bundled = resolveBundledGraphqlFromCustomEnv();
    err.mockRestore();
    expect(bundled?.id).toBe("linear");
  });
});
