import { afterEach, describe, expect, it } from "vitest";
import { isGoogleDiscoverySpecLabel, mergedAuthHeaders } from "./auth-headers.js";

afterEach(() => {
  delete process.env.CLAWQL_HTTP_HEADERS;
  delete process.env.CLAWQL_BEARER_TOKEN;
  delete process.env.GOOGLE_ACCESS_TOKEN;
  delete process.env.CLAWQL_GOOGLE_ACCESS_TOKEN;
  delete process.env.CLAWQL_GITHUB_TOKEN;
  delete process.env.CLAWQL_CLOUDFLARE_API_TOKEN;
  delete process.env.CLOUDFLARE_API_TOKEN;
  delete process.env.CLAWQL_PROVIDER;
});

describe("isGoogleDiscoverySpecLabel", () => {
  it("matches top50 slugs and single provider id", () => {
    expect(isGoogleDiscoverySpecLabel("compute-v1")).toBe(true);
    expect(isGoogleDiscoverySpecLabel("networksecurity-v1beta1")).toBe(true);
    expect(isGoogleDiscoverySpecLabel("dataflow-v1b3")).toBe(true);
    expect(isGoogleDiscoverySpecLabel("google")).toBe(true);
  });

  it("rejects other merged vendor labels", () => {
    expect(isGoogleDiscoverySpecLabel("github")).toBe(false);
    expect(isGoogleDiscoverySpecLabel("cloudflare")).toBe(false);
    expect(isGoogleDiscoverySpecLabel("jira")).toBe(false);
  });
});

describe("mergedAuthHeaders", () => {
  it("uses Google access token for compute-v1 specLabel over generic bearer", () => {
    process.env.CLAWQL_BEARER_TOKEN = "wrong";
    process.env.CLAWQL_GOOGLE_ACCESS_TOKEN = "ya29.google";
    expect(mergedAuthHeaders("compute-v1")).toEqual({
      Authorization: "Bearer ya29.google",
    });
  });

  it("uses CLAWQL_PROVIDER=google-top50 for GraphQL-style calls without specLabel", () => {
    process.env.CLAWQL_PROVIDER = "google-top50";
    process.env.GOOGLE_ACCESS_TOKEN = "ya29.x";
    delete process.env.CLAWQL_BEARER_TOKEN;
    expect(mergedAuthHeaders()).toEqual({
      Authorization: "Bearer ya29.x",
    });
  });
});
