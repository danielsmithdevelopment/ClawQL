import { afterEach, describe, expect, it } from "vitest";
import { isGoogleDiscoverySpecLabel, mergedAuthHeaders } from "./auth-headers.js";

afterEach(() => {
  delete process.env.CLAWQL_HTTP_HEADERS;
  delete process.env.CLAWQL_PROVIDER_AUTH_JSON;
  delete process.env.CLAWQL_BEARER_TOKEN;
  delete process.env.GOOGLE_ACCESS_TOKEN;
  delete process.env.CLAWQL_GOOGLE_ACCESS_TOKEN;
  delete process.env.CLAWQL_GITHUB_TOKEN;
  delete process.env.GITHUB_TOKEN;
  delete process.env.GH_TOKEN;
  delete process.env.CLAWQL_CLOUDFLARE_API_TOKEN;
  delete process.env.CLOUDFLARE_API_TOKEN;
  delete process.env.CLAWQL_CLOUDFLARE_EMAIL;
  delete process.env.CLOUDFLARE_EMAIL;
  delete process.env.CLAWQL_CLOUDFLARE_GLOBAL_API_KEY;
  delete process.env.CLOUDFLARE_GLOBAL_API_KEY;
  delete process.env.CLOUDFLARE_API_KEY;
  delete process.env.CLAWQL_PROVIDER;
  delete process.env.PAPERLESS_API_TOKEN;
  delete process.env.CLAWQL_PAPERLESS_API_TOKEN;
  delete process.env.STIRLING_API_KEY;
  delete process.env.CLAWQL_STIRLING_API_KEY;
  delete process.env.ONYX_API_TOKEN;
  delete process.env.CLAWQL_ONYX_API_TOKEN;
  delete process.env.SLACK_BOT_TOKEN;
  delete process.env.N8N_API_KEY;
  delete process.env.SENTRY_AUTH_TOKEN;
  delete process.env.CLAWQL_ATLASSIAN_TOKEN;
});

describe("isGoogleDiscoverySpecLabel", () => {
  it("matches Google Cloud manifest slugs and preset ids", () => {
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

  it("uses CLAWQL_PROVIDER=google for GraphQL-style calls without specLabel", () => {
    process.env.CLAWQL_PROVIDER = "google";
    process.env.GOOGLE_ACCESS_TOKEN = "ya29.x";
    delete process.env.CLAWQL_BEARER_TOKEN;
    expect(mergedAuthHeaders()).toEqual({
      Authorization: "Bearer ya29.x",
    });
  });

  it("merges json headers with bearer only for the active provider (no cross-vendor bearer)", () => {
    process.env.CLAWQL_HTTP_HEADERS = '{"X-Test":"1"}';
    process.env.CLAWQL_PROVIDER = "jira";
    process.env.CLAWQL_BEARER_TOKEN = "atlassian_pat";
    expect(mergedAuthHeaders()).toEqual({
      "X-Test": "1",
      Authorization: "Bearer atlassian_pat",
    });
  });

  it("does not override existing Authorization header", () => {
    process.env.CLAWQL_HTTP_HEADERS = '{"Authorization":"Token xyz"}';
    process.env.CLAWQL_BEARER_TOKEN = "abc";
    expect(mergedAuthHeaders()).toEqual({
      Authorization: "Token xyz",
    });
  });

  it("uses CLAWQL_GITHUB_TOKEN for specLabel github over CLAWQL_BEARER_TOKEN", () => {
    process.env.CLAWQL_BEARER_TOKEN = "generic";
    process.env.CLAWQL_GITHUB_TOKEN = "gh_tok";
    expect(mergedAuthHeaders("github")).toEqual({
      Authorization: "Bearer gh_tok",
    });
  });

  it("uses CLOUDFLARE_API_TOKEN for specLabel cloudflare over CLAWQL_BEARER_TOKEN", () => {
    process.env.CLAWQL_BEARER_TOKEN = "generic";
    process.env.CLOUDFLARE_API_TOKEN = "cf_tok";
    expect(mergedAuthHeaders("cloudflare")).toEqual({
      Authorization: "Bearer cf_tok",
    });
  });

  it("uses X-Auth-Email and X-Auth-Key when Cloudflare Global API Key envs are set", () => {
    process.env.CLOUDFLARE_EMAIL = "ops@example.com";
    process.env.CLOUDFLARE_API_KEY = "cf_global_secret";
    expect(mergedAuthHeaders("cloudflare")).toEqual({
      "X-Auth-Email": "ops@example.com",
      "X-Auth-Key": "cf_global_secret",
    });
  });

  it("prefers explicit Cloudflare API token over Global API Key pair", () => {
    process.env.CLOUDFLARE_API_TOKEN = "api_token_wins";
    process.env.CLOUDFLARE_EMAIL = "ops@example.com";
    process.env.CLOUDFLARE_API_KEY = "global_ignored";
    expect(mergedAuthHeaders("cloudflare")).toEqual({
      Authorization: "Bearer api_token_wins",
    });
  });

  it("uses CLAWQL_PROVIDER when specLabel is unset (single-vendor)", () => {
    process.env.CLAWQL_PROVIDER = "github";
    process.env.CLAWQL_GITHUB_TOKEN = "gh_only";
    delete process.env.CLAWQL_BEARER_TOKEN;
    expect(mergedAuthHeaders()).toEqual({
      Authorization: "Bearer gh_only",
    });
  });

  it("uses GOOGLE_ACCESS_TOKEN for Google Cloud manifest specLabel", () => {
    process.env.CLAWQL_BEARER_TOKEN = "must_not_be_used_for_gcp";
    process.env.GOOGLE_ACCESS_TOKEN = "ya29.gcp";
    expect(mergedAuthHeaders("container-v1")).toEqual({
      Authorization: "Bearer ya29.gcp",
    });
  });

  it("does not send CLAWQL_BEARER_TOKEN to slack (use SLACK_BOT_TOKEN or CLAWQL_PROVIDER_AUTH_JSON)", () => {
    process.env.CLAWQL_BEARER_TOKEN = "only_for_other_vendors";
    expect(mergedAuthHeaders("slack")).toEqual({});
  });

  it("does not send GOOGLE_ACCESS_TOKEN to github", () => {
    process.env.GOOGLE_ACCESS_TOKEN = "ya29.wrong_vendor";
    process.env.CLAWQL_GITHUB_TOKEN = "ghp_right";
    expect(mergedAuthHeaders("github")).toEqual({
      Authorization: "Bearer ghp_right",
    });
  });

  it("uses N8N_API_KEY as X-N8N-API-KEY for n8n specLabel", () => {
    process.env.N8N_API_KEY = "n8n_secret";
    expect(mergedAuthHeaders("n8n")).toEqual({
      "X-N8N-API-KEY": "n8n_secret",
    });
  });

  it("uses Paperless Token auth for specLabel paperless", () => {
    process.env.PAPERLESS_API_TOKEN = "abc123secret";
    expect(mergedAuthHeaders("paperless")).toEqual({
      Authorization: "Token abc123secret",
    });
  });

  it("passes through Paperless token when already prefixed", () => {
    process.env.PAPERLESS_API_TOKEN = "Token already";
    expect(mergedAuthHeaders("paperless")).toEqual({
      Authorization: "Token already",
    });
  });

  it("uses X-API-KEY for specLabel stirling", () => {
    process.env.STIRLING_API_KEY = "k1";
    expect(mergedAuthHeaders("stirling")).toEqual({
      "X-API-KEY": "k1",
    });
  });

  it("uses Bearer for specLabel onyx from ONYX_API_TOKEN", () => {
    process.env.ONYX_API_TOKEN = "onyx_pat_1";
    expect(mergedAuthHeaders("onyx")).toEqual({
      Authorization: "Bearer onyx_pat_1",
    });
  });

  it("uses CLAWQL_ONYX_API_TOKEN when ONYX_API_TOKEN unset", () => {
    process.env.CLAWQL_ONYX_API_TOKEN = "fallback_tok";
    expect(mergedAuthHeaders("onyx")).toEqual({
      Authorization: "Bearer fallback_tok",
    });
  });

  it("CLAWQL_PROVIDER_AUTH_JSON sets distinct Authorization per specLabel", () => {
    process.env.CLAWQL_PROVIDER_AUTH_JSON = JSON.stringify({
      github: "ghp_map_github",
      cloudflare: "cf_map_token",
    });
    process.env.CLAWQL_GITHUB_TOKEN = "ignored_when_map";
    process.env.CLAWQL_CLOUDFLARE_API_TOKEN = "ignored_when_map";
    expect(mergedAuthHeaders("github")).toEqual({
      Authorization: "Bearer ghp_map_github",
    });
    expect(mergedAuthHeaders("cloudflare")).toEqual({
      Authorization: "Bearer cf_map_token",
    });
  });

  it("CLAWQL_PROVIDER_AUTH_JSON google key applies to Discovery slugs", () => {
    process.env.CLAWQL_PROVIDER_AUTH_JSON = JSON.stringify({
      google: "ya29.all_gcp",
    });
    process.env.CLAWQL_GOOGLE_ACCESS_TOKEN = "ignored_when_map";
    expect(mergedAuthHeaders("compute-v1")).toEqual({
      Authorization: "Bearer ya29.all_gcp",
    });
    expect(mergedAuthHeaders("container-v1")).toEqual({
      Authorization: "Bearer ya29.all_gcp",
    });
  });

  it("CLAWQL_PROVIDER_AUTH_JSON exact slug overrides google catch-all", () => {
    process.env.CLAWQL_PROVIDER_AUTH_JSON = JSON.stringify({
      google: "ya29.default",
      "compute-v1": "ya29.compute_only",
    });
    expect(mergedAuthHeaders("compute-v1")).toEqual({
      Authorization: "Bearer ya29.compute_only",
    });
    expect(mergedAuthHeaders("dns-v1")).toEqual({
      Authorization: "Bearer ya29.default",
    });
  });

  it("with CLAWQL_PROVIDER_AUTH_JSON, ignores global Authorization in CLAWQL_HTTP_HEADERS", () => {
    process.env.CLAWQL_HTTP_HEADERS = JSON.stringify({
      Authorization: "Bearer wrong_global",
      "X-Trace": "t1",
    });
    process.env.CLAWQL_PROVIDER_AUTH_JSON = JSON.stringify({
      github: "ghp_right",
    });
    expect(mergedAuthHeaders("github")).toEqual({
      "X-Trace": "t1",
      Authorization: "Bearer ghp_right",
    });
  });

  it("CLAWQL_PROVIDER_AUTH_JSON value can be a header object", () => {
    process.env.CLAWQL_PROVIDER_AUTH_JSON = JSON.stringify({
      stirling: { "X-API-KEY": "from_map", "X-Org": "acme" },
    });
    process.env.STIRLING_API_KEY = "from_env";
    expect(mergedAuthHeaders("stirling")).toEqual({
      "X-API-KEY": "from_map",
      "X-Org": "acme",
    });
  });
});
