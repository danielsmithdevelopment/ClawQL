import { Effect } from "effect";
import { afterEach, describe, expect, it } from "vitest";
import { executeRestOperation, mergedAuthHeadersEffect, renderPath } from "clawql-api";
import type { OpenAPIDoc } from "clawql-api";

const mergedAuthHeaders = (specLabel?: string): Record<string, string> =>
  Effect.runSync(mergedAuthHeadersEffect(specLabel));
import type { Operation } from "clawql-api";
import { INLINE_OPENAPI_REQUEST_BODY } from "clawql-api";
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

  it("multipart encodes Buffer as a file part with optional *FileName", async () => {
    await withFetchServer(
      async (req) => {
        const fd = await req.formData();
        const f = fd.get("file");
        expect(f).toBeInstanceOf(Blob);
        const buf = Buffer.from(await (f as Blob).arrayBuffer());
        expect(buf.toString("utf8")).toBe("hi");
        expect(fd.get("fileFileName")).toBeNull();
        return Response.json({ ok: true });
      },
      async (origin) => {
        const out = await executeRestOperation(
          makeOp({
            method: "POST",
            requestBody: INLINE_OPENAPI_REQUEST_BODY,
            requestBodyContentType: "multipart/form-data",
          }),
          { file: Buffer.from("hi", "utf8"), fileFileName: "doc.txt" },
          makeOpenApi(origin)
        );
        expect(out).toEqual({ ok: true, data: { ok: true } });
      }
    );
  });

  it("multipart decodes base64 file part when *Encoding is base64", async () => {
    await withFetchServer(
      async (req) => {
        const fd = await req.formData();
        const f = fd.get("fileInput");
        expect(f).toBeInstanceOf(Blob);
        const buf = Buffer.from(await (f as Blob).arrayBuffer());
        expect(buf.toString("utf8")).toBe("hi");
        expect(fd.get("fileInputFileName")).toBeNull();
        return Response.json({ ok: true });
      },
      async (origin) => {
        const out = await executeRestOperation(
          makeOp({
            method: "POST",
            requestBody: INLINE_OPENAPI_REQUEST_BODY,
            requestBodyContentType: "multipart/form-data",
          }),
          {
            fileInput: Buffer.from("hi", "utf8").toString("base64"),
            fileInputEncoding: "base64",
            fileInputFileName: "doc.txt",
          },
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
        expect(new URL(req.url).search).toBe("");
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

  it("decodes base64 application/octet-stream when args.bodyEncoding is base64", async () => {
    await withFetchServer(
      async (req) => {
        expect(req.method).toBe("PUT");
        const url = new URL(req.url);
        expect(url.search).toBe("");
        expect(req.headers.get("content-type")).toBe("application/octet-stream");
        const buf = Buffer.from(await req.arrayBuffer());
        expect(buf.equals(Buffer.from([0x00, 0xff, 0x0d, 0x0a]))).toBe(true);
        return Response.json({ ok: true });
      },
      async (origin) => {
        const out = await executeRestOperation(
          makeOp({
            method: "PUT",
            requestBody: INLINE_OPENAPI_REQUEST_BODY,
            requestBodyContentType: "application/octet-stream",
          }),
          {
            body: Buffer.from([0x00, 0xff, 0x0d, 0x0a]).toString("base64"),
            bodyEncoding: "base64",
          },
          makeOpenApi(origin)
        );
        expect(out).toEqual({ ok: true, data: { ok: true } });
      }
    );
  });

  it("sends optional bodyContentType for octet-stream (e.g. application/pdf)", async () => {
    await withFetchServer(
      async (req) => {
        expect(req.headers.get("content-type")).toBe("application/pdf");
        return Response.json({ ok: true });
      },
      async (origin) => {
        const out = await executeRestOperation(
          makeOp({
            method: "PUT",
            requestBody: INLINE_OPENAPI_REQUEST_BODY,
            requestBodyContentType: "application/octet-stream",
          }),
          { body: "%PDF-1.4", bodyContentType: "application/pdf" },
          makeOpenApi(origin)
        );
        expect(out).toEqual({ ok: true, data: { ok: true } });
      }
    );
  });

  it("Tika GET /version sends Accept: text/plain (avoid 406)", async () => {
    await withFetchServer(
      async (req) => {
        expect(req.method).toBe("GET");
        expect(req.headers.get("accept")).toBe("text/plain");
        const url = new URL(req.url);
        expect(url.pathname).toBe("/version");
        return new Response("Apache Tika 2.9.2", { status: 200 });
      },
      async (origin) => {
        const out = await executeRestOperation(
          makeOp({
            id: "tika_server_version",
            method: "GET",
            path: "/version",
            flatPath: "/version",
            specLabel: "tika",
            description: "",
            resource: "version",
            parameters: {},
            scopes: [],
          }),
          {},
          makeOpenApi(origin)
        );
        expect(out).toEqual({ ok: true, data: "Apache Tika 2.9.2" });
      }
    );
  });

  it("Tika PUT /tika sends Accept: application/json (structured parse metadata)", async () => {
    await withFetchServer(
      async (req) => {
        expect(req.method).toBe("PUT");
        expect(req.headers.get("accept")).toBe("application/json");
        const url = new URL(req.url);
        expect(url.pathname).toBe("/tika");
        expect(url.search).toBe("");
        return Response.json({ "X-TIKA:content": "<p>hi</p>" });
      },
      async (origin) => {
        const out = await executeRestOperation(
          makeOp({
            id: "tika_parse_put",
            method: "PUT",
            path: "/tika",
            flatPath: "/tika",
            specLabel: "tika",
            description: "",
            resource: "tika",
            parameters: {},
            scopes: [],
            requestBody: INLINE_OPENAPI_REQUEST_BODY,
            requestBodyContentType: "application/octet-stream",
          }),
          { body: "hello" },
          makeOpenApi(origin)
        );
        expect(out).toEqual({ ok: true, data: { "X-TIKA:content": "<p>hi</p>" } });
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

  it("returns error for AWS specLabel when SigV4 credentials are missing", async () => {
    delete process.env.AWS_ACCESS_KEY_ID;
    delete process.env.AWS_SECRET_ACCESS_KEY;
    delete process.env.CLAWQL_AWS_ACCESS_KEY_ID;
    delete process.env.CLAWQL_AWS_SECRET_ACCESS_KEY;
    const out = await executeRestOperation(
      makeOp({
        specLabel: "sts-2011-06-15",
        flatPath: "#Action=GetCallerIdentity",
        path: "#Action=GetCallerIdentity",
      }),
      {},
      {
        openapi: "3.0.0",
        info: { title: "STS", version: "2011-06-15", "x-serviceName": "sts" },
        servers: [{ url: "https://sts.amazonaws.com" }],
      }
    );
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.error).toMatch(/SigV4 credentials/i);
    }
  });

  it("dispatches Slack vs Onyx fetch stubs by URL when both are enabled", async () => {
    process.env.CLAWQL_TEST_SLACK_FETCH_STUB = "1";
    process.env.CLAWQL_TEST_ONYX_FETCH_STUB = "1";
    process.env.CLAWQL_TEST_SLACK_FETCH_BODY = '{"ok":true,"channel":"C-DUAL","from":"slack"}';
    process.env.CLAWQL_TEST_ONYX_FETCH_BODY =
      '{"query":"q","documents":[{"content":"from=onyx CLAWQL_ONYX_CODE=quartz-21"}]}';

    const slackOut = await executeRestOperation(
      makeOp({
        id: "chat_postMessage",
        method: "POST",
        path: "api/chat.postMessage",
        flatPath: "api/chat.postMessage",
        parameters: {},
      }),
      { channel: "C-DUAL", text: "hi" },
      makeOpenApi("https://api.slack.com/")
    );
    expect(slackOut.ok).toBe(true);
    if (slackOut.ok) {
      expect(slackOut.data).toMatchObject({ from: "slack", channel: "C-DUAL" });
    }

    const onyxOut = await executeRestOperation(
      makeOp({
        id: "handle_send_search_message",
        method: "POST",
        path: "search/send-search-message",
        flatPath: "search/send-search-message",
        parameters: {},
      }),
      { search_query: "q" },
      makeOpenApi("http://127.0.0.1:9/")
    );
    expect(onyxOut.ok).toBe(true);
    if (onyxOut.ok) {
      const data = onyxOut.data as { documents?: { content?: string }[] };
      expect(data.documents?.[0]?.content).toMatch(/from=onyx/);
    }

    delete process.env.CLAWQL_TEST_SLACK_FETCH_STUB;
    delete process.env.CLAWQL_TEST_ONYX_FETCH_STUB;
    delete process.env.CLAWQL_TEST_SLACK_FETCH_BODY;
    delete process.env.CLAWQL_TEST_ONYX_FETCH_BODY;
  });
});
