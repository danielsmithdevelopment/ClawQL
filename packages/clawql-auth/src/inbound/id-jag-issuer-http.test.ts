import { Effect } from "effect";
import express from "express";
import { exportPKCS8, generateKeyPair } from "jose";
import { describe, expect, it } from "vitest";

import { createMemoryEmaConnectorRegistry } from "./ema-connector-registry.js";
import {
  attachMcpOAuthRoutes,
  ID_JAG_ISSUE_PATH,
  ID_JAG_ISSUER_JWKS_PATH,
} from "./http.js";
import {
  createIdJagIssuerService,
  fixedOrgMaterialResolver,
} from "./id-jag-issuer.js";
import { loadMcpOAuthSigningMaterialEffect } from "./mcp-oauth-signing.js";

describe("ID-JAG issuer HTTP routes", () => {
  it("publishes JWKS, persists connectors, and issues assertions", async () => {
    const { privateKey } = await generateKeyPair("RS256", { extractable: true });
    const signing = await Effect.runPromise(
      loadMcpOAuthSigningMaterialEffect({
        privateKeyPem: await exportPKCS8(privateKey),
        keyId: "http-issuer",
      })
    );
    const connectors = createMemoryEmaConnectorRegistry();
    const service = createIdJagIssuerService({
      connectors,
      resolveOrgMaterial: fixedOrgMaterialResolver({
        orgId: "acme",
        issuer: "https://idp.clawql.test/acme",
        jwksUri: "https://idp.clawql.test/.well-known/id-jag-jwks.json?orgId=acme",
        signing,
      }),
    });

    const app = express();
    app.use("/oauth/ema", express.json());
    app.use("/oauth/id-jag", express.json());
    attachMcpOAuthRoutes(app, null, {
      idJagIssuer: {
        service,
        connectors,
        defaultOrgId: "acme",
        adminApiKey: "admin-key",
      },
    });

    const server = app.listen(0);
    const addr = server.address();
    const port = typeof addr === "object" && addr ? addr.port : 0;
    const base = `http://127.0.0.1:${port}`;

    try {
      const jwks = await fetch(`${base}${ID_JAG_ISSUER_JWKS_PATH}?orgId=acme`);
      expect(jwks.status).toBe(200);
      const jwksBody = (await jwks.json()) as { keys: Array<{ alg?: string; kid?: string }> };
      expect(jwksBody.keys[0]?.alg).toBe("RS256");
      expect(jwksBody.keys[0]?.kid).toBe("http-issuer");

      const put = await fetch(`${base}/oauth/ema/connectors/acme/cursor`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": "admin-key",
        },
        body: JSON.stringify({
          audience: "https://mcp.clawql.test/",
          label: "Cursor",
          enabled: true,
        }),
      });
      expect(put.status).toBe(200);

      const list = await fetch(`${base}/oauth/ema/connectors/acme`, {
        headers: { "x-api-key": "admin-key" },
      });
      expect(list.status).toBe(200);
      const listed = (await list.json()) as { connectors: Array<{ connectorId: string }> };
      expect(listed.connectors.map((c) => c.connectorId)).toContain("cursor");

      const issue = await fetch(`${base}${ID_JAG_ISSUE_PATH}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": "admin-key",
        },
        body: JSON.stringify({
          orgId: "acme",
          subjectId: "user-42",
          connectorId: "cursor",
          groups: ["engineering"],
        }),
      });
      expect(issue.status).toBe(200);
      const issued = (await issue.json()) as { assertion: string; jti: string };
      expect(issued.assertion).toBeTruthy();
      expect(issued.jti).toBeTruthy();
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve()))
      );
    }
  });
});
