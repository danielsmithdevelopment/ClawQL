import { describe, expect, it } from "vitest";

import { buildAuth0EmaOrgConfig, extractAuth0GroupsFromPayload } from "./auth0-id-jag.js";

describe("auth0-id-jag", () => {
  it("builds Auth0 JWKS and issuer URLs", () => {
    const config = buildAuth0EmaOrgConfig({
      orgId: "acme",
      auth0Domain: "https://acme.us.auth0.com/",
      audience: "https://mcp.example.com/",
      groupMappings: [{ idpGroup: "engineering", scope: ["execute"] }],
    });
    expect(config.idpJwksUri).toBe("https://acme.us.auth0.com/.well-known/jwks.json");
    expect(config.idpIssuer).toBe("https://acme.us.auth0.com/");
    expect(config.groupsClaim).toBe("https://schemas.auth0.com/groups");
  });

  it("extracts groups from Auth0 namespaced and permissions claims", () => {
    const groups = extractAuth0GroupsFromPayload({
      "https://schemas.auth0.com/groups": ["Platform", "Engineering"],
      permissions: ["read:tools"],
    });
    expect(groups).toEqual(["Platform", "Engineering", "read:tools"]);
  });
});
