import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isCombinedGraphQLMode, useInProcessGraphQL } from "./graphql-combined-mode.js";

describe("graphql-combined-mode", () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    saved.CLAWQL_COMBINED_MODE = process.env.CLAWQL_COMBINED_MODE;
    saved.CLAWQL_GRAPHQL_EXTERNAL_URL = process.env.CLAWQL_GRAPHQL_EXTERNAL_URL;
  });

  afterEach(() => {
    for (const key of Object.keys(saved)) {
      const v = saved[key as keyof typeof saved];
      if (v === undefined) delete process.env[key];
      else process.env[key] = v;
    }
  });

  it("isCombinedGraphQLMode is true for 1/true/yes", () => {
    delete process.env.CLAWQL_COMBINED_MODE;
    expect(isCombinedGraphQLMode()).toBe(false);
    process.env.CLAWQL_COMBINED_MODE = "1";
    expect(isCombinedGraphQLMode()).toBe(true);
    process.env.CLAWQL_COMBINED_MODE = "true";
    expect(isCombinedGraphQLMode()).toBe(true);
    process.env.CLAWQL_COMBINED_MODE = "YES";
    expect(isCombinedGraphQLMode()).toBe(true);
  });

  it("useInProcessGraphQL is false when CLAWQL_GRAPHQL_EXTERNAL_URL is set", () => {
    process.env.CLAWQL_COMBINED_MODE = "1";
    process.env.CLAWQL_GRAPHQL_EXTERNAL_URL = "http://127.0.0.1:9999/graphql";
    expect(useInProcessGraphQL()).toBe(false);
  });

  it("useInProcessGraphQL follows CLAWQL_COMBINED_MODE when external URL unset", () => {
    delete process.env.CLAWQL_GRAPHQL_EXTERNAL_URL;
    delete process.env.CLAWQL_COMBINED_MODE;
    expect(useInProcessGraphQL()).toBe(false);
    process.env.CLAWQL_COMBINED_MODE = "1";
    expect(useInProcessGraphQL()).toBe(true);
  });
});
