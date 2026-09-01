import { Effect } from "effect";
import { exportPKCS8, generateKeyPair } from "jose";
import { describe, expect, it } from "vitest";

import type { AuthEvent } from "../audit/auth-events.js";
import {
  createMemoryEmaConfigStore,
  resetIdJagJwksCacheForTests,
  verifyIdJagAssertionEffect,
} from "./id-jag.js";
import { createMemoryEmaConnectorRegistry } from "./ema-connector-registry.js";
import {
  createIdJagIssuerService,
  fixedOrgMaterialResolver,
  issueIdJagAssertionEffect,
  IdJagIssuerError,
} from "./id-jag-issuer.js";
import { loadMcpOAuthSigningMaterialEffect } from "./mcp-oauth-signing.js";
import {
  createMCPOAuthServer,
  createMemoryMcpClientRegistry,
  createMemoryMcpRefreshStore,
} from "./mcp-oauth.js";

describe("ID-JAG issuer + connector registry", () => {
  it("issues RS256 ID-JAG assertions for enabled connectors and rejects disabled ones", async () => {
    const { privateKey } = await generateKeyPair("RS256", { extractable: true });
    const signing = await Effect.runPromise(
      loadMcpOAuthSigningMaterialEffect({
        privateKeyPem: await exportPKCS8(privateKey),
        keyId: "issuer-1",
      })
    );

    const connectors = createMemoryEmaConnectorRegistry([
      {
        orgId: "acme",
        connectorId: "claude-desktop",
        audience: "https://mcp.clawql.test/",
        enabled: true,
        createdAt: new Date().toISOString(),
      },
      {
        orgId: "acme",
        connectorId: "disabled-bot",
        audience: "https://mcp.clawql.test/",
        enabled: false,
        createdAt: new Date().toISOString(),
      },
    ]);

    const events: AuthEvent[] = [];
    const deps = {
      connectors,
      resolveOrgMaterial: fixedOrgMaterialResolver({
        orgId: "acme",
        issuer: "https://idp.clawql.test/acme",
        jwksUri: "https://idp.clawql.test/.well-known/id-jag-jwks.json?orgId=acme",
        signing,
      }),
      eventSink: (e: AuthEvent) =>
        Effect.sync(() => {
          events.push(e);
        }),
    };

    const issued = await Effect.runPromise(
      issueIdJagAssertionEffect(
        {
          orgId: "acme",
          subjectId: "user-42",
          connectorId: "claude-desktop",
          groups: ["engineering", "guests"],
          email: "dev@acme.com",
        },
        deps
      )
    );

    expect(issued.jti).toBeTruthy();
    expect(issued.assertion.split(".")).toHaveLength(3);
    const header = JSON.parse(
      Buffer.from(issued.assertion.split(".")[0]!, "base64url").toString("utf8")
    ) as { alg: string; kid?: string };
    expect(header.alg).toBe("RS256");
    expect(header.kid).toBe("issuer-1");

    expect(events.find((e) => e.type === "ID_JAG_ASSERTION_ISSUED")).toMatchObject({
      type: "ID_JAG_ASSERTION_ISSUED",
      orgId: "acme",
      connectorId: "claude-desktop",
      subjectId: "user-42",
      groups: ["engineering", "guests"],
      jti: issued.jti,
    });

    const disabled = await Effect.runPromise(
      issueIdJagAssertionEffect(
        {
          orgId: "acme",
          subjectId: "user-42",
          connectorId: "disabled-bot",
          groups: ["engineering"],
        },
        deps
      ).pipe(Effect.either)
    );
    expect(disabled._tag).toBe("Left");
    if (disabled._tag === "Left") {
      expect(disabled.left.reason).toBe("connector_disabled");
    }

    const missing = await Effect.runPromise(
      issueIdJagAssertionEffect(
        {
          orgId: "acme",
          subjectId: "user-42",
          connectorId: "missing",
          groups: ["engineering"],
        },
        deps
      ).pipe(Effect.either)
    );
    expect(missing._tag).toBe("Left");
    if (missing._tag === "Left") {
      expect(missing.left).toBeInstanceOf(IdJagIssuerError);
      expect(missing.left.reason).toBe("unknown_connector");
    }
  });

  it("round-trips issued assertion through consumer verify + MCP token exchange", async () => {
    resetIdJagJwksCacheForTests();
    const hsSecret = "test-id-jag-issuer-hs256-secret-32chars!!";
    const audience = "https://mcp.clawql.test/";
    const issuerUri = "https://idp.clawql.test/acme";
    const events: AuthEvent[] = [];

    const signing = await Effect.runPromise(
      loadMcpOAuthSigningMaterialEffect({ signingSecret: hsSecret })
    );
    const connectors = createMemoryEmaConnectorRegistry([
      {
        orgId: "acme",
        connectorId: "cursor",
        audience,
        enabled: true,
        createdAt: new Date().toISOString(),
      },
    ]);
    const service = createIdJagIssuerService({
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
    });

    const issued = await Effect.runPromise(
      service.issueAssertion({
        orgId: "acme",
        subjectId: "user-42",
        connectorId: "cursor",
        groups: ["engineering"],
        email: "dev@acme.com",
      })
    );

    const consumerVerified = await Effect.runPromise(
      verifyIdJagAssertionEffect(issued.assertion, {
        orgId: "acme",
        idpJwksUri: "https://unused.example/jwks",
        idpIssuer: issuerUri,
        audience,
        hs256Secret: hsSecret,
        groupMappings: [
          { idpGroup: "engineering", scope: ["execute", "search", "memory"], role: "operator" },
        ],
      })
    );
    expect(consumerVerified.sub).toBe("user-42");
    expect(consumerVerified.groups).toEqual(["engineering"]);
    expect(consumerVerified.email).toBe("dev@acme.com");
    expect(consumerVerified.jti).toBe(issued.jti);

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
              {
                idpGroup: "engineering",
                scope: ["execute", "search", "memory"],
                role: "operator",
              },
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
        grantType: "id_jag",
        assertion: issued.assertion,
        orgId: "acme",
      })
    );
    expect(token.scope).toBe("execute search memory");
    const claims = await Effect.runPromise(mcp.validateToken(token.access_token));
    expect(claims.sub).toBe("user-42");
    expect(claims.idpGroups).toEqual(["engineering"]);
    expect(claims.role).toBe("operator");

    const assertionEvent = events.find((e) => e.type === "ID_JAG_ASSERTION_ISSUED");
    const tokenEvent = events.find((e) => e.type === "MCP_TOKEN_ISSUED");
    expect(assertionEvent).toMatchObject({
      type: "ID_JAG_ASSERTION_ISSUED",
      jti: issued.jti,
    });
    expect(tokenEvent).toMatchObject({
      type: "MCP_TOKEN_ISSUED",
      grantType: "id_jag",
      idJagJti: issued.jti,
    });
  });

  it("Layer C: uses injected TEE assertionSigner when provided", async () => {
    const { privateKey } = await generateKeyPair("RS256", { extractable: true });
    const signing = await Effect.runPromise(
      loadMcpOAuthSigningMaterialEffect({
        privateKeyPem: await exportPKCS8(privateKey),
        keyId: "tee-kid",
      })
    );
    const connectors = createMemoryEmaConnectorRegistry([
      {
        orgId: "acme",
        connectorId: "claude-desktop",
        audience: "https://mcp.clawql.test/",
        enabled: true,
        createdAt: new Date().toISOString(),
      },
    ]);

    let teeCalls = 0;
    const { createTeeIdJagAssertionSigner, createLocalIdJagAssertionSigner } =
      await import("./id-jag-tee-signer.js");
    const local = createLocalIdJagAssertionSigner(signing);
    const tee = createTeeIdJagAssertionSigner({
      teeSign: (req) => {
        teeCalls += 1;
        return local.sign(req);
      },
    });
    expect(tee.kind).toBe("tee");

    const issued = await Effect.runPromise(
      issueIdJagAssertionEffect(
        {
          orgId: "acme",
          subjectId: "user-tee",
          connectorId: "claude-desktop",
          groups: ["engineering"],
        },
        {
          connectors,
          resolveOrgMaterial: fixedOrgMaterialResolver({
            orgId: "acme",
            issuer: "https://idp.clawql.test/acme",
            jwksUri: "https://idp.clawql.test/jwks",
            signing,
          }),
          assertionSigner: tee,
        }
      )
    );
    expect(teeCalls).toBe(1);
    expect(issued.assertion.split(".")).toHaveLength(3);
  });
});
