import { describe, expect, it } from "vitest";
import {
  buildProvidersVaultPayload,
  DEFAULT_STACK_VAULT_ENTRIES,
  vaultProviderDataToEnv,
} from "./catalog.js";

describe("provider-vault catalog", () => {
  it("includes default-stack vendors", () => {
    const props = DEFAULT_STACK_VAULT_ENTRIES.map((e) => e.vaultProperty);
    expect(props).toContain("githubToken");
    expect(props).toContain("linearApiKey");
    expect(props).toContain("notionApiToken");
  });

  it("buildProvidersVaultPayload maps env aliases", () => {
    const payload = buildProvidersVaultPayload({
      GITHUB_TOKEN: "ghp_test",
      LINEAR_API_KEY: "lin_test",
    });
    expect(payload.githubToken).toBe("ghp_test");
    expect(payload.linearApiKey).toBe("lin_test");
  });

  it("vaultProviderDataToEnv maps to canonical env keys", () => {
    const env = vaultProviderDataToEnv({
      githubToken: "ghp_test",
      linearApiKey: "lin_test",
    });
    expect(env.CLAWQL_GITHUB_TOKEN).toBe("ghp_test");
    expect(env.LINEAR_API_KEY).toBe("lin_test");
  });
});
