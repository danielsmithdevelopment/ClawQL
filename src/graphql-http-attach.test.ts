import { createServer, type Server } from "node:http";
import { once } from "node:events";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetSpecCache } from "clawql-api";
import { attachGraphqlHttpToMcpApp } from "./graphql-http-attach.js";

const here = dirname(fileURLToPath(import.meta.url));
const minimalSpec = join(here, "test-utils/fixtures/minimal-petstore.json");
const minimalWidgets = join(here, "test-utils/fixtures/minimal-widgets.json");

function closeHttpServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
}

describe("attachGraphqlHttpToMcpApp", () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    saved.CLAWQL_SPEC_PATH = process.env.CLAWQL_SPEC_PATH;
    saved.CLAWQL_PROVIDER = process.env.CLAWQL_PROVIDER;
    saved.CLAWQL_BUNDLED_PROVIDERS = process.env.CLAWQL_BUNDLED_PROVIDERS;
    saved.CLAWQL_SPEC_PATHS = process.env.CLAWQL_SPEC_PATHS;
    saved.CLAWQL_BUNDLED_PROVIDERS = process.env.CLAWQL_BUNDLED_PROVIDERS;
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

  it("mounts /graphql for single-spec mode", async () => {
    process.env.CLAWQL_SPEC_PATH = minimalSpec;
    delete process.env.CLAWQL_PROVIDER;
    delete process.env.CLAWQL_BUNDLED_PROVIDERS;

    const app = express();
    await attachGraphqlHttpToMcpApp(app);
    const server = createServer(app);
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const addr = server.address();
    if (!addr || typeof addr === "string") throw new Error("expected TCP address");
    const base = `http://127.0.0.1:${addr.port}`;
    try {
      const res = await fetch(`${base}/graphql`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: "{ __typename }" }),
      });
      expect(res.status).not.toBe(404);
    } finally {
      await closeHttpServer(server);
    }
  });

  it("skips /graphql for merged multi-spec without failing startup", async () => {
    delete process.env.CLAWQL_SPEC_PATH;
    delete process.env.CLAWQL_PROVIDER;
    delete process.env.CLAWQL_BUNDLED_PROVIDERS;
    process.env.CLAWQL_SPEC_PATHS = `${minimalSpec},${minimalWidgets}`;

    const app = express();
    await expect(attachGraphqlHttpToMcpApp(app)).resolves.toBeUndefined();

    const server = createServer(app);
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const addr = server.address();
    if (!addr || typeof addr === "string") throw new Error("expected TCP address");
    const base = `http://127.0.0.1:${addr.port}`;
    try {
      const res = await fetch(`${base}/graphql`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: "{ __typename }" }),
      });
      expect(res.status).toBe(404);
    } finally {
      await closeHttpServer(server);
    }
  });
});
