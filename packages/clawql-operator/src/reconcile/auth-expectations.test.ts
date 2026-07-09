import { describe, expect, it } from "vitest";
import {
  buildAuthExpectationsPayload,
  checkProviderSecret,
  resolveRequiredVaultKeys,
} from "./auth-expectations.js";

describe("auth-expectations", () => {
  it("requires default stack only when documents disabled", () => {
    const keys = resolveRequiredVaultKeys({ documents: { enabled: false } });
    const props = keys.map((k) => k.vaultProperty);
    expect(props).toContain("githubToken");
    expect(props).toContain("notionApiToken");
    expect(props).not.toContain("paperlessApiToken");
    expect(props).not.toContain("doclingApiKey");
  });

  it("requires IDP vault keys when documents enabled", () => {
    const keys = resolveRequiredVaultKeys({ documents: { enabled: true } });
    const props = keys.map((k) => k.vaultProperty);
    expect(props).toContain("paperlessApiToken");
    expect(props).toContain("nextcloudAppPassword");
    expect(props).toContain("githubToken");
  });

  it("detects missing secret keys", () => {
    const payload = buildAuthExpectationsPayload({ documents: { enabled: false } });
    const result = checkProviderSecret(
      { CLAWQL_GITHUB_TOKEN: "ghp_x", LINEAR_API_KEY: "lin_x" },
      payload
    );
    expect(result.secretExists).toBe(true);
    expect(result.ready).toBe(false);
    expect(result.missing.length).toBeGreaterThan(0);
  });

  it("accepts vault property names in secret data", () => {
    const payload = buildAuthExpectationsPayload({ documents: { enabled: false } });
    const allDefault = Object.fromEntries(
      resolveRequiredVaultKeys({ documents: { enabled: false } }).map((e) => [
        e.vaultProperty,
        "set",
      ])
    );
    const result = checkProviderSecret(allDefault, payload);
    expect(result.ready).toBe(true);
    expect(result.missing).toEqual([]);
  });
});
