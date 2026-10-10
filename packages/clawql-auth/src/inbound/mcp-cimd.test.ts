import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import {
  CimdError,
  createMemoryTrustedClientStore,
  cimdServiceLayer,
  CimdService,
  isHttpsClientIdUrl,
  parseCimdDocumentEffect,
  resolveTrustedCimdClientEffect,
} from "./mcp-cimd.js";

describe("MCP OAuth §3 CIMD", () => {
  const clientUrl = "https://app.example/oauth/client.json";
  const doc = {
    client_id: clientUrl,
    redirect_uris: ["https://app.example/cb"],
    client_name: "Example",
  };

  it("accepts only https client_id URLs", () => {
    expect(isHttpsClientIdUrl(clientUrl)).toBe(true);
    expect(isHttpsClientIdUrl("http://app.example/x")).toBe(false);
    expect(isHttpsClientIdUrl("svc-bot")).toBe(false);
  });

  it("parses a valid CIMD document", async () => {
    const parsed = await Effect.runPromise(parseCimdDocumentEffect(doc));
    expect(parsed.redirect_uris).toEqual(["https://app.example/cb"]);
  });

  it("fail-closed when client is not on the trusted list", async () => {
    const err = await Effect.runPromise(
      resolveTrustedCimdClientEffect(clientUrl, doc, null).pipe(Effect.flip)
    );
    expect(err).toBeInstanceOf(CimdError);
    expect(err.reason).toBe("client_not_trusted");
  });

  it("resolves when trusted and redirects are allowlisted", async () => {
    const trusted = {
      clientIdUrl: clientUrl,
      redirectUris: ["https://app.example/cb", "https://app.example/cb2"],
      trustedAtMs: 1,
    };
    const out = await Effect.runPromise(
      resolveTrustedCimdClientEffect(clientUrl, doc, trusted)
    );
    expect(out.documentSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("CimdService layer rejects untrusted clients", async () => {
    const store = createMemoryTrustedClientStore([]);
    const err = await Effect.runPromise(
      Effect.gen(function* () {
        const svc = yield* CimdService;
        return yield* svc.resolve(clientUrl, doc);
      }).pipe(Effect.provide(cimdServiceLayer(store)), Effect.flip)
    );
    expect(err.reason).toBe("client_not_trusted");
  });
});
