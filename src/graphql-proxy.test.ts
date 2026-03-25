import { createServer } from "node:http";
import { once } from "node:events";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createGraphqlProxyApp } from "./graphql-proxy.js";
import { resetSpecCache } from "./spec-loader.js";

const here = dirname(fileURLToPath(import.meta.url));
const minimalSpec = join(here, "test-utils/fixtures/minimal-petstore.json");

describe("graphql-proxy", () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    saved.CLAWQL_SPEC_PATH = process.env.CLAWQL_SPEC_PATH;
    saved.CLAWQL_PROVIDER = process.env.CLAWQL_PROVIDER;
    saved.CLAWQL_SPEC_PATHS = process.env.CLAWQL_SPEC_PATHS;
    saved.GRAPHQL_PORT = process.env.GRAPHQL_PORT;
    process.env.CLAWQL_SPEC_PATH = minimalSpec;
    delete process.env.CLAWQL_PROVIDER;
    delete process.env.CLAWQL_SPEC_PATHS;
    delete process.env.GRAPHQL_PORT;
    resetSpecCache();
  });

  afterEach(() => {
    for (const key of Object.keys(saved)) {
      const v = saved[key as keyof typeof saved];
      if (v === undefined) delete process.env[key];
      else process.env[key] = v;
    }
    resetSpecCache();
  });

  it("GET /health returns ok", async () => {
    const { app } = await createGraphqlProxyApp({ port: 0 });
    const server = createServer(app);
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const addr = server.address();
    if (!addr || typeof addr === "string") throw new Error("expected TCP address");
    const port = addr.port;
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`);
      expect(res.ok).toBe(true);
      const body = (await res.json()) as { status: string };
      expect(body.status).toBe("ok");
    } finally {
      server.close();
      await once(server, "close");
    }
  });

  it("POST /graphql answers a minimal query", async () => {
    const { app } = await createGraphqlProxyApp({ port: 0 });
    const server = createServer(app);
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const addr = server.address();
    if (!addr || typeof addr === "string") throw new Error("expected TCP address");
    const port = addr.port;
    try {
      const res = await fetch(`http://127.0.0.1:${port}/graphql`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: "{ __typename }" }),
      });
      expect(res.ok).toBe(true);
      const body = (await res.json()) as { data?: { __typename: string } };
      expect(body.data?.__typename).toBe("Query");
    } finally {
      server.close();
      await once(server, "close");
    }
  });
});
