import { afterEach, describe, expect, it } from "bun:test";
import { executeRestOperation, mergedAuthHeaders, renderPath } from "./rest-operation.js";
import type { OpenAPIDoc } from "./spec-loader.js";
import type { Operation } from "./operation-types.js";

function makeOpenApi(serverUrl: string): OpenAPIDoc {
  return {
    openapi: "3.0.3",
    info: { title: "t", version: "1" },
    servers: [{ url: serverUrl }],
    paths: {},
  };
}

function makeOp(overrides: Partial<Operation> = {}): Operation {
  return {
    id: "svc.get",
    method: "GET",
    path: "v1/items/{itemId}",
    flatPath: "v1/items/{itemId}",
    description: "Get item",
    resource: "items",
    parameters: {
      itemId: { type: "string", location: "path", required: true, description: "" },
      q: { type: "string", location: "query", required: false, description: "" },
    },
    scopes: [],
    ...overrides,
  };
}

afterEach(() => {
  delete process.env.CLAWQL_HTTP_HEADERS;
  delete process.env.CLAWQL_BEARER_TOKEN;
  delete process.env.GOOGLE_ACCESS_TOKEN;
});

describe("rest-operation helpers", () => {
  it("renderPath substitutes params and URL-encodes values", () => {
    expect(renderPath("v1/{name}", { name: "a b/c" })).toBe("v1/a%20b%2Fc");
    expect(renderPath("v1/{name}", {})).toBe("v1/{name}");
  });

  it("mergedAuthHeaders merges json headers and bearer fallback", () => {
    process.env.CLAWQL_HTTP_HEADERS = '{"X-Test":"1"}';
    process.env.CLAWQL_BEARER_TOKEN = "abc";
    expect(mergedAuthHeaders()).toEqual({
      "X-Test": "1",
      Authorization: "Bearer abc",
    });
  });

  it("does not override existing Authorization header", () => {
    process.env.CLAWQL_HTTP_HEADERS = '{"Authorization":"Token xyz"}';
    process.env.CLAWQL_BEARER_TOKEN = "abc";
    expect(mergedAuthHeaders()).toEqual({
      Authorization: "Token xyz",
    });
  });
});

describe("executeRestOperation", () => {
  it("executes GET and sends non-path args as query params", async () => {
    const server = Bun.serve({
      port: 0,
      fetch(req) {
        const url = new URL(req.url);
        expect(req.method).toBe("GET");
        expect(url.pathname).toBe("/v1/items/abc");
        expect(url.searchParams.get("q")).toBe("hello");
        expect(url.searchParams.get("itemId")).toBeNull();
        return Response.json({ ok: true, id: "abc" });
      },
    });
    try {
      const out = await executeRestOperation(
        makeOp(),
        { itemId: "abc", q: "hello" },
        makeOpenApi(`http://127.0.0.1:${server.port}`)
      );
      expect(out).toEqual({ ok: true, data: { ok: true, id: "abc" } });
    } finally {
      server.stop(true);
    }
  });

  it("executes POST with JSON body when requestBody is present", async () => {
    const server = Bun.serve({
      port: 0,
      async fetch(req) {
        expect(req.method).toBe("POST");
        expect(req.headers.get("content-type")).toContain("application/json");
        const url = new URL(req.url);
        expect(url.pathname).toBe("/v1/items/abc");
        expect(url.searchParams.get("q")).toBe("hello");
        const body = await req.json();
        // Path and query args are not duplicated in JSON body (see buildRestRequestBodyFromArgs).
        expect(body).toMatchObject({ note: "create" });
        return Response.json({ ok: true });
      },
    });
    try {
      const out = await executeRestOperation(
        makeOp({ method: "POST", requestBody: "CreateReq" }),
        { itemId: "abc", q: "hello", note: "create" },
        makeOpenApi(`http://127.0.0.1:${server.port}`)
      );
      expect(out).toEqual({ ok: true, data: { ok: true } });
    } finally {
      server.stop(true);
    }
  });

  it("returns formatted error on non-OK response", async () => {
    const server = Bun.serve({
      port: 0,
      fetch() {
        return new Response("bad upstream", { status: 500 });
      },
    });
    try {
      const out = await executeRestOperation(
        makeOp(),
        { itemId: "abc" },
        makeOpenApi(`http://127.0.0.1:${server.port}`)
      );
      expect(out.ok).toBe(false);
      if (!out.ok) {
        expect(out.error).toContain("REST HTTP 500: bad upstream");
      }
    } finally {
      server.stop(true);
    }
  });

  it("falls back to raw text payload for non-JSON success bodies", async () => {
    const server = Bun.serve({
      port: 0,
      fetch() {
        return new Response("plain-text");
      },
    });
    try {
      const out = await executeRestOperation(
        makeOp(),
        { itemId: "abc" },
        makeOpenApi(`http://127.0.0.1:${server.port}`)
      );
      expect(out).toEqual({ ok: true, data: "plain-text" });
    } finally {
      server.stop(true);
    }
  });

  it("returns error if OpenAPI has no resolvable base URL", async () => {
    const openapiNoServers = {
      openapi: "3.0.3",
      info: { title: "t", version: "1" },
      paths: {},
    } as OpenAPIDoc;
    const out = await executeRestOperation(makeOp(), { itemId: "abc" }, openapiNoServers);
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.error).toContain("OpenAPI spec has no servers[0].url");
    }
  });
});

