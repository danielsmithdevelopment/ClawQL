import { describe, expect, it } from "vitest";

import { buildOktaEmaOrgConfig, extractOktaGroupsFromPayload } from "./okta-id-jag.js";

describe("okta-id-jag", () => {
  it("builds Okta JWKS and issuer URLs", () => {
    const config = buildOktaEmaOrgConfig({
      orgId: "acme",
      oktaDomain: "https://acme.okta.com/",
      audience: "https://mcp.example.com/",
      groupMappings: [{ idpGroup: "engineering", scope: ["execute"] }],
    });
    expect(config.idpJwksUri).toBe("https://acme.okta.com/oauth2/default/v1/keys");
    expect(config.idpIssuer).toBe("https://acme.okta.com/oauth2/default");
    expect(config.idpProvider).toBe("okta");
  });

  it("extracts groups from nested Okta claim shapes", () => {
    const groups = extractOktaGroupsFromPayload({
      claims: { groups: ["Platform", "Engineering"] },
    });
    expect(groups).toEqual(["Platform", "Engineering"]);
  });
});
