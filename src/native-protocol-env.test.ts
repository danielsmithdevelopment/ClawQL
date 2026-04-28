import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  hasNativeProtocolEnv,
  parseGraphQLSourcesEnv,
  shouldLoadNativeProtocolsOnlyMode,
  wantsOpenAPISpecSelectionEnv,
} from "./native-protocol-env.js";

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

  it("shouldLoadNativeProtocolsOnlyMode when GraphQL URL set and no OpenAPI env", () => {
    vi.stubEnv("CLAWQL_GRAPHQL_URL", "https://api.linear.app/graphql");
    expect(wantsOpenAPISpecSelectionEnv()).toBe(false);
    expect(hasNativeProtocolEnv()).toBe(true);
    expect(shouldLoadNativeProtocolsOnlyMode()).toBe(true);
  });

  it("does not use native-only mode when CLAWQL_PROVIDER is set", () => {
    vi.stubEnv("CLAWQL_GRAPHQL_URL", "https://api.linear.app/graphql");
    vi.stubEnv("CLAWQL_PROVIDER", "github");
    expect(wantsOpenAPISpecSelectionEnv()).toBe(true);
    expect(shouldLoadNativeProtocolsOnlyMode()).toBe(false);
  });
});
