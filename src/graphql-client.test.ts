import { afterEach, describe, expect, it } from "bun:test";
import { createGraphQLClient } from "./graphql-client.js";

function startServer(
  handler: (req: Request) => Response | Promise<Response>
): Bun.Server {
  return Bun.serve({
    port: 0,
    fetch: handler,
  });
}

afterEach(() => {
  delete process.env.GRAPHQL_URL;
});

describe("graphql-client", () => {
  it("returns GraphQL data for successful responses", async () => {
    const server = startServer(async (req) => {
      const body = await req.json();
      expect(body).toMatchObject({
        query: "query X { ping }",
        variables: { a: 1 },
      });
      return Response.json({ data: { ping: "pong" } });
    });
    process.env.GRAPHQL_URL = `http://127.0.0.1:${server.port}/graphql`;

    try {
      const client = createGraphQLClient();
      const out = await client.query<{ ping: string }>("query X { ping }", {
        a: 1,
      });
      expect(out).toEqual({ ping: "pong" });
    } finally {
      server.stop(true);
    }
  });

  it("throws on HTTP non-OK responses", async () => {
    const server = startServer(
      () => new Response("proxy failed", { status: 502 })
    );
    process.env.GRAPHQL_URL = `http://127.0.0.1:${server.port}/graphql`;

    try {
      const client = createGraphQLClient();
      await expect(client.query("query X { ping }")).rejects.toThrow(
        "GraphQL proxy returned HTTP 502: proxy failed"
      );
    } finally {
      server.stop(true);
    }
  });

  it("throws when GraphQL response has errors", async () => {
    const server = startServer(() =>
      Response.json({
        errors: [{ message: "bad field" }, { message: "validation failed" }],
      })
    );
    process.env.GRAPHQL_URL = `http://127.0.0.1:${server.port}/graphql`;

    try {
      const client = createGraphQLClient();
      await expect(client.query("query X { ping }")).rejects.toThrow(
        "GraphQL errors: bad field; validation failed"
      );
    } finally {
      server.stop(true);
    }
  });

  it("throws when GraphQL response contains no data", async () => {
    const server = startServer(() => Response.json({}));
    process.env.GRAPHQL_URL = `http://127.0.0.1:${server.port}/graphql`;

    try {
      const client = createGraphQLClient();
      await expect(client.query("query X { ping }")).rejects.toThrow(
        "GraphQL response contained no data."
      );
    } finally {
      server.stop(true);
    }
  });
});

