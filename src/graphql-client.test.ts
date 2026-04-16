import { afterEach, describe, expect, it } from "vitest";
import { createGraphQLClient } from "./graphql-client.js";
import { withFetchServer } from "./test-utils/fetch-test-server.js";

afterEach(() => {
  delete process.env.GRAPHQL_URL;
  delete process.env.CLAWQL_GRAPHQL_EXTERNAL_URL;
});

describe("graphql-client", () => {
  it("returns GraphQL data for successful responses", async () => {
    await withFetchServer(async (req) => {
      const body = await req.json();
      expect(body).toMatchObject({
        query: "query X { ping }",
        variables: { a: 1 },
      });
      return Response.json({ data: { ping: "pong" } });
    }, async (origin) => {
      process.env.GRAPHQL_URL = `${origin}/graphql`;
      const client = createGraphQLClient();
      const out = await client.query<{ ping: string }>("query X { ping }", {
        a: 1,
      });
      expect(out).toEqual({ ping: "pong" });
    });
  });

  it("throws on HTTP non-OK responses", async () => {
    await withFetchServer(
      () => new Response("proxy failed", { status: 502 }),
      async (origin) => {
        process.env.GRAPHQL_URL = `${origin}/graphql`;
        const client = createGraphQLClient();
        await expect(client.query("query X { ping }")).rejects.toThrow(
          "GraphQL proxy returned HTTP 502: proxy failed"
        );
      }
    );
  });

  it("throws when GraphQL response has errors", async () => {
    await withFetchServer(
      () =>
        Response.json({
          errors: [{ message: "bad field" }, { message: "validation failed" }],
        }),
      async (origin) => {
        process.env.GRAPHQL_URL = `${origin}/graphql`;
        const client = createGraphQLClient();
        await expect(client.query("query X { ping }")).rejects.toThrow(
          "GraphQL errors: bad field; validation failed"
        );
      }
    );
  });

  it("throws when GraphQL response contains no data", async () => {
    await withFetchServer(() => Response.json({}), async (origin) => {
      process.env.GRAPHQL_URL = `${origin}/graphql`;
      const client = createGraphQLClient();
      await expect(client.query("query X { ping }")).rejects.toThrow(
        "GraphQL response contained no data."
      );
    });
  });

  it("prefers CLAWQL_GRAPHQL_EXTERNAL_URL over GRAPHQL_URL", async () => {
    await withFetchServer(
      async (req) => {
        const body = await req.json();
        expect(body.query).toContain("ping");
        return Response.json({ data: { ping: "from-external" } });
      },
      async (origin) => {
        process.env.GRAPHQL_URL = "http://wrong-host.invalid/graphql";
        process.env.CLAWQL_GRAPHQL_EXTERNAL_URL = `${origin}/graphql`;
        const client = createGraphQLClient();
        const out = await client.query<{ ping: string }>("query X { ping }");
        expect(out.ping).toBe("from-external");
      }
    );
  });
});
