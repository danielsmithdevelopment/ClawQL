#!/usr/bin/env node
/**
 * XAA smoke: self-hosted ID-JAG issue → MCP jwt-bearer exchange → validate.
 * Run: node scripts/dev/xaa-smoke.mjs
 */
import { Effect } from "effect";
import {
  createMemoryEmaConfigStore,
  createMemoryEmaConnectorRegistry,
  createMCPOAuthServer,
  createMemoryMcpClientRegistry,
  createMemoryMcpRefreshStore,
  fixedOrgMaterialResolver,
  ID_JAG_JWT_BEARER_GRANT,
  issueIdJagAssertionEffect,
  loadMcpOAuthSigningMaterialEffect,
} from "clawql-auth";

const hsSecret = "xaa-smoke-id-jag-hs256-secret-32chars!!";
const audience = "https://mcp.clawql.test/";
const issuerUri = "https://idp.clawql.test/acme";

const signing = await Effect.runPromise(
  loadMcpOAuthSigningMaterialEffect({ signingSecret: hsSecret })
);

const connectors = createMemoryEmaConnectorRegistry([
  {
    orgId: "acme",
    connectorId: "smoke-client",
    audience,
    enabled: true,
    createdAt: new Date().toISOString(),
  },
]);

const issued = await Effect.runPromise(
  issueIdJagAssertionEffect(
    {
      orgId: "acme",
      subjectId: "smoke-user",
      connectorId: "smoke-client",
      groups: ["engineering"],
    },
    {
      connectors,
      resolveOrgMaterial: fixedOrgMaterialResolver({
        orgId: "acme",
        issuer: issuerUri,
        jwksUri: "https://idp.clawql.test/jwks",
        signing,
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
        groupMappings: [{ idpGroup: "engineering", scope: ["execute"], role: "operator" }],
      },
    ]),
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

const claims = await Effect.runPromise(mcp.validateToken(token.access_token));
console.log(
  JSON.stringify(
    {
      ok: true,
      subject: claims.sub,
      role: claims.role,
      scope: claims.scope,
      idJagJti: issued.jti,
      grant: ID_JAG_JWT_BEARER_GRANT,
    },
    null,
    2
  )
);
