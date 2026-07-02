import { describe, expect, it } from "vitest";
import {
  buildProvidersVaultPayload,
  PROVIDER_VAULT_KEY_CATALOG,
} from "./provider-vault-key-catalog.js";

describe("provider-vault-key-catalog", () => {
  it("maps IDP provider env vars to Vault properties", () => {
    const payload = buildProvidersVaultPayload({
      PAPERLESS_API_TOKEN: "paperless-secret",
      NEXTCLOUD_USERNAME: "alice",
      NEXTCLOUD_APP_PASSWORD: "app-pass",
      CONESHARE_API_TOKEN: "cone-jwt",
      STIRLING_API_KEY: "stirling-key",
      DOCLING_API_KEY: "docling-key",
    });
    expect(payload).toEqual({
      paperlessApiToken: "paperless-secret",
      nextcloudUsername: "alice",
      nextcloudAppPassword: "app-pass",
      coneshareApiToken: "cone-jwt",
      stirlingApiKey: "stirling-key",
      doclingApiKey: "docling-key",
    });
  });

  it("catalog entries have unique vault properties and env keys", () => {
    const props = PROVIDER_VAULT_KEY_CATALOG.map((e) => e.vaultProperty);
    const envKeys = PROVIDER_VAULT_KEY_CATALOG.map((e) => e.envKey);
    expect(new Set(props).size).toBe(props.length);
    expect(new Set(envKeys).size).toBe(envKeys.length);
  });
});
