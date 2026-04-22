import { afterEach, describe, expect, it } from "vitest";
import { executeRestOperation, mergedAuthHeaders, renderPath } from "./rest-operation.js";
import type { OpenAPIDoc } from "./spec-loader.js";
import type { Operation } from "./operation-types.js";
import { INLINE_OPENAPI_REQUEST_BODY } from "./operation-types.js";
import { withFetchServer } from "./test-utils/fetch-test-server.js";

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
  delete process.env.CLAWQL_GOOGLE_ACCESS_TOKEN;
  delete process.env.CLAWQL_GITHUB_TOKEN;
  delete process.env.GITHUB_TOKEN;
  delete process.env.GH_TOKEN;
  delete process.env.CLAWQL_CLOUDFLARE_API_TOKEN;
  delete process.env.CLOUDFLARE_API_TOKEN;
  delete process.env.CLAWQL_PROVIDER;
  delete process.env.PAPERLESS_BASE_URL;
});

describe("rest-operation helpers", () => {
  it("renderPath substitutes params and URL-encodes values", () => {
    expect(renderPath("v1/{name}", { name: "a b/c" })).toBe("v1/a%20b%2Fc");
    expect(renderPath("v1/{name}", {})).toBe("v1/{name}");
  });

  it("mergedAuthHeaders merges json headers with bearer only for the active provider", () => {
    process.env.CLAWQL_HTTP_HEADERS = '{"X-Test":"1"}';
    process.env.CLAWQL_PROVIDER = "jira";
    process.env.CLAWQL_BEARER_TOKEN = "atlassian_pat";
    expect(mergedAuthHeaders()).toEqual({
      "X-Test": "1",
      Authorization: "Bearer atlassian_pat",
    });
  });

  it("does not override existing Authorization header", () => {
    process.env.CLAWQL_HTTP_HEADERS = '{"Authorization":"Token xyz"}';
    process.env.CLAWQL_BEARER_TOKEN = "abc";
    expect(mergedAuthHeaders()).toEqual({
      Authorization: "Token xyz",
    });
  });

  it("uses CLAWQL_GITHUB_TOKEN for specLabel github over CLAWQL_BEARER_TOKEN", () => {
    process.env.CLAWQL_BEARER_TOKEN = "generic";
    process.env.CLAWQL_GITHUB_TOKEN = "gh_tok";
    expect(mergedAuthHeaders("github")).toEqual({
      Authorization: "Bearer gh_tok",
    });
  });

  it("uses CLOUDFLARE_API_TOKEN for specLabel cloudflare over CLAWQL_BEARER_TOKEN", () => {
    process.env.CLAWQL_BEARER_TOKEN = "generic";
    process.env.CLOUDFLARE_API_TOKEN = "cf_tok";
    expect(mergedAuthHeaders("cloudflare")).toEqual({
      Authorization: "Bearer cf_tok",
    });
  });

  it("uses CLAWQL_PROVIDER when specLabel is unset (single-vendor)", () => {
    process.env.CLAWQL_PROVIDER = "github";
    process.env.CLAWQL_GITHUB_TOKEN = "gh_only";
    delete process.env.CLAWQL_BEARER_TOKEN;
    expect(mergedAuthHeaders()).toEqual({
      Authorization: "Bearer gh_only",
    });
  });

  it("uses GOOGLE_ACCESS_TOKEN for Google Discovery specLabel", () => {
    process.env.CLAWQL_BEARER_TOKEN = "must_not_be_used_for_gcp";
    process.env.GOOGLE_ACCESS_TOKEN = "ya29.gcp";
    expect(mergedAuthHeaders("container-v1")).toEqual({
      Authorization: "Bearer ya29.gcp",
    });
  });
});

describe("executeRestOperation", () => {
  it("executes GET and sends non-path args as query params", async () => {
    await withFetchServer(
      async (req) => {
        const url = new URL(req.url);
        expect(req.method).toBe("GET");
        expect(url.pathname).toBe("/v1/items/abc");
        expect(url.searchParams.get("q")).toBe("hello");
        expect(url.searchParams.get("itemId")).toBeNull();
        return Response.json({ ok: true, id: "abc" });
      },
      async (origin) => {
        const out = await executeRestOperation(
          makeOp(),
          { itemId: "abc", q: "hello" },
          makeOpenApi(origin)
        );
        expect(out).toEqual({ ok: true, data: { ok: true, id: "abc" } });
      }
    );
  });

  it("executes POST with JSON body when requestBody is present", async () => {
    await withFetchServer(
      async (req) => {
        expect(req.method).toBe("POST");
        expect(req.headers.get("content-type")).toContain("application/json");
        const url = new URL(req.url);
        expect(url.pathname).toBe("/v1/items/abc");
        expect(url.searchParams.get("q")).toBe("hello");
        const body = await req.json();
        expect(body).toMatchObject({ note: "create" });
        return Response.json({ ok: true });
      },
      async (origin) => {
        const out = await executeRestOperation(
          makeOp({ method: "POST", requestBody: "CreateReq" }),
          { itemId: "abc", q: "hello", note: "create" },
          makeOpenApi(origin)
        );
        expect(out).toEqual({ ok: true, data: { ok: true } });
      }
    );
  });

  it("returns formatted error on non-OK response", async () => {
    await withFetchServer(
      () => new Response("bad upstream", { status: 500 }),
      async (origin) => {
        const out = await executeRestOperation(makeOp(), { itemId: "abc" }, makeOpenApi(origin));
        expect(out.ok).toBe(false);
        if (!out.ok) {
          expect(out.error).toContain("REST HTTP 500: bad upstream");
        }
      }
    );
  });

  it("falls back to raw text payload for non-JSON success bodies", async () => {
    await withFetchServer(
      () => new Response("plain-text"),
      async (origin) => {
        const out = await executeRestOperation(makeOp(), { itemId: "abc" }, makeOpenApi(origin));
        expect(out).toEqual({ ok: true, data: "plain-text" });
      }
    );
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

  it("sends multipart/form-data when operation declares that content type", async () => {
    await withFetchServer(
      async (req) => {
        expect(req.method).toBe("POST");
        const ct = req.headers.get("content-type") ?? "";
        expect(ct).toContain("multipart/form-data");
        const fd = await req.formData();
        expect(fd.get("url")).toBe("https://example.com/");
        return Response.json({ ok: true });
      },
      async (origin) => {
        const out = await executeRestOperation(
          makeOp({
            method: "POST",
            requestBody: INLINE_OPENAPI_REQUEST_BODY,
            requestBodyContentType: "multipart/form-data",
          }),
          { url: "https://example.com/" },
          makeOpenApi(origin)
        );
        expect(out).toEqual({ ok: true, data: { ok: true } });
      }
    );
  });

  it("sends application/octet-stream when args.body is a string", async () => {
    await withFetchServer(
      async (req) => {
        expect(req.method).toBe("PUT");
        expect(req.headers.get("content-type")).toBe("application/octet-stream");
        const buf = Buffer.from(await req.arrayBuffer());
        expect(buf.toString("utf8")).toBe("hello");
        return Response.json({ ok: true });
      },
      async (origin) => {
        const out = await executeRestOperation(
          makeOp({
            method: "PUT",
            requestBody: INLINE_OPENAPI_REQUEST_BODY,
            requestBodyContentType: "application/octet-stream",
          }),
          { body: "hello" },
          makeOpenApi(origin)
        );
        expect(out).toEqual({ ok: true, data: { ok: true } });
      }
    );
  });

  it("uses PAPERLESS_BASE_URL when specLabel is paperless", async () => {
    await withFetchServer(
      async (req) => {
        const url = new URL(req.url);
        expect(url.origin + url.pathname).toMatch(/\/v1\/items\/abc$/);
        return Response.json({ ok: true });
      },
      async (origin) => {
        process.env.PAPERLESS_BASE_URL = origin;
        const out = await executeRestOperation(
          makeOp({ specLabel: "paperless" }),
          { itemId: "abc" },
          makeOpenApi("http://ignored:9999")
        );
        expect(out).toEqual({ ok: true, data: { ok: true } });
      }
    );
  });
});
