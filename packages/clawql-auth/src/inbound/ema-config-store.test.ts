import { describe, expect, it } from "vitest";

import { createMemorySecretStore } from "../stores/memory.js";
import {
  bootstrapEmaOrgsToStore,
  createSecretStoreEmaConfigStore,
  loadEmaOrgsFromJson,
} from "./ema-config-store.js";

describe("ema-config-store", () => {
  it("persists and loads org config from SecretStore", async () => {
    const store = createSecretStoreEmaConfigStore(createMemorySecretStore());
    await store.saveOrgConfig({
      orgId: "acme",
      idpJwksUri: "https://idp.test/jwks",
      idpIssuer: "https://idp.test/",
      audience: "https://mcp.test/",
      groupMappings: [{ idpGroup: "engineering", scope: ["execute"] }],
    });

    const loaded = await store.getOrgConfig("acme");
    expect(loaded?.orgId).toBe("acme");
    expect(loaded?.groupMappings[0]?.idpGroup).toBe("engineering");
    expect(await store.listOrgIds()).toEqual(["acme"]);
  });

  it("bootstraps Okta shorthand from JSON", async () => {
    const configs = loadEmaOrgsFromJson(
      JSON.stringify({
        orgs: [
          {
            provider: "okta",
            orgId: "acme",
            oktaDomain: "acme.okta.com",
            audience: "https://mcp.test/",
            groupMappings: [{ idpGroup: "eng", scope: ["search"] }],
          },
        ],
      })
    );
    expect(configs[0]?.idpJwksUri).toContain("acme.okta.com");
    expect(configs[0]?.idpProvider).toBe("okta");

    const store = createSecretStoreEmaConfigStore(createMemorySecretStore());
    expect(await bootstrapEmaOrgsToStore(store, configs)).toBe(1);
    expect(await store.getOrgConfig("acme")).toBeTruthy();
  });
});
