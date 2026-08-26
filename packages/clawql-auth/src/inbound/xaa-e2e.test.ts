/**
 * End-to-end XAA smoke: ID-JAG issuer → Resource App AS token exchange → validate.
 * Exercises the same path Okta/Auth0 document for MCP Enterprise-Managed Authorization.
 */

import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import type { AuthEvent } from "../audit/auth-events.js";
import { buildAuth0EmaOrgConfig } from "./auth0-id-jag.js";
import {
  createMemoryEmaConfigStore,
  ID_JAG_JWT_BEARER_GRANT,
  resetIdJagJwksCacheForTests,
} from "./id-jag.js";
import { createMemoryEmaConnectorRegistry } from "./ema-connector-registry.js";
import { fixedOrgMaterialResolver, issueIdJagAssertionEffect } from "./id-jag-issuer.js";
import { buildOktaEmaOrgConfig } from "./okta-id-jag.js";
import { loadMcpOAuthSigningMaterialEffect } from "./mcp-oauth-signing.js";
import {
  createMCPOAuthServer,
  createMemoryMcpClientRegistry,
  createMemoryMcpRefreshStore,
} from "./mcp-oauth.js";

describe("XAA E2E smoke (Resource App AS)", () => {
  it("issues ID-JAG, exchanges at jwt-bearer grant, validates MCP access JWT", async () => {
    resetIdJagJwksCacheForTests();
    const hsSecret = "xaa-e2e-id-jag-hs256-secret-32chars!!";
    const audience = "https://mcp.clawql.test/";
    const issuerUri = "https://idp.clawql.test/acme";
    const events: AuthEvent[] = [];

    const signing = await Effect.runPromise(
      loadMcpOAuthSigningMaterialEffect({ signingSecret: hsSecret })
    );
    const connectors = createMemoryEmaConnectorRegistry([
      {
        orgId: "acme",
        connectorId: "claude-desktop",
        audience,
        enabled: true,
        createdAt: new Date().toISOString(),
      },
    ]);

    const issued = await Effect.runPromise(
      issueIdJagAssertionEffect(
        {
          orgId: "acme",
          subjectId: "user-99",
          connectorId: "claude-desktop",
          groups: ["engineering"],
          email: "dev@acme.com",
        },
        {
          connectors,
          resolveOrgMaterial: fixedOrgMaterialResolver({
            orgId: "acme",
            issuer: issuerUri,
            jwksUri: "https://idp.clawql.test/jwks",
            signing,
          }),
          eventSink: (e) =>
            Effect.sync(() => {
              events.push(e);
            }),
        }
      )
    );

    const mcp = createMCPOAuthServer(
      {
        issuer: "https://auth.clawql.test",
        signingSecret: "test-mcp-oauth-signing-secret-32b!!",
        resourceAudience: audience,
        emaConfigStore: createMemoryEmaConfigStore([
          {
            orgId: "acme",
            idpJwksUri: "https://unused.example/jwks",
            idpIssuer: issuerUri,
            audience,
            hs256Secret: hsSecret,
            groupMappings: [
              { idpGroup: "engineering", scope: ["execute", "search"], role: "operator" },
            ],
          },
        ]),
        eventSink: (e) =>
          Effect.sync(() => {
            events.push(e);
          }),
      },
      createMemoryMcpClientRegistry([]),
      createMemoryMcpRefreshStore()
    );

    const token = await Effect.runPromise(
      mcp.issueToken({
        grantType: ID_JAG_JWT_BEARER_GRANT,
        assertion: issued.assertion,
        orgId: "acme",
      })
    );

    expect(token.access_token).toBeTruthy();
    expect(token.refresh_token).toBeUndefined();

    const claims = await Effect.runPromise(mcp.validateToken(token.access_token));
    expect(claims.sub).toBe("user-99");
    expect(claims.role).toBe("operator");
    expect(claims.idpGroups).toEqual(["engineering"]);

    expect(events.find((e) => e.type === "ID_JAG_ASSERTION_ISSUED")).toMatchObject({
      jti: issued.jti,
    });
    expect(events.find((e) => e.type === "MCP_TOKEN_ISSUED")).toMatchObject({
      grantType: "id_jag",
      idJagJti: issued.jti,
    });
  });

  it("documents Okta and Auth0 org preset shapes for enterprise bootstrap", () => {
    const okta = buildOktaEmaOrgConfig({
      orgId: "acme",
      oktaDomain: "acme.okta.com",
      audience: "https://mcp.example.com/",
      groupMappings: [{ idpGroup: "engineering", scope: ["execute"] }],
    });
    expect(okta.idpJwksUri).toContain("/oauth2/default/v1/keys");

    const auth0 = buildAuth0EmaOrgConfig({
      orgId: "acme",
      auth0Domain: "acme.us.auth0.com",
      audience: "https://mcp.example.com/",
      groupMappings: [{ idpGroup: "engineering", scope: ["execute"] }],
    });
    expect(auth0.idpJwksUri).toBe("https://acme.us.auth0.com/.well-known/jwks.json");
  });
});
