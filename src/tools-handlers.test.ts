import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as specLoader from "./spec-loader.js";
import type { OpenAPIDoc } from "./spec-loader.js";
import type { Operation } from "./spec-loader.js";
import {
  handleClawqlExecuteToolInput,
  handleClawqlSearchToolInput,
  resetSchemaFieldCache,
} from "./tools.js";
import { withFetchServer } from "./test-utils/fetch-test-server.js";

describe("MCP tool handlers", () => {
  beforeEach(() => {
    resetSchemaFieldCache();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetSchemaFieldCache();
  });

  it("handleClawqlSearchToolInput returns JSON results", async () => {
    const operations: Operation[] = [
      {
        id: "pets.list",
        method: "GET",
        path: "/pets",
        flatPath: "/pets",
        description: "List all pets in the store",
        resource: "pets",
        parameters: {},
      } as Operation,
    ];
    vi.spyOn(specLoader, "loadSpec").mockResolvedValue({
      operations,
      openapi: { openapi: "3.0.0", info: { title: "x", version: "1" }, paths: {}, components: { schemas: {} } },
      rawSource: {},
    });

    const out = await handleClawqlSearchToolInput({
      query: "list pets",
      limit: 5,
    });
    const text = out.content[0].text;
    const parsed = JSON.parse(text) as { results: { id: string }[] };
    expect(parsed.results.length).toBeGreaterThan(0);
    expect(parsed.results[0].id).toBe("pets.list");
  });

  it("handleClawqlExecuteToolInput returns error for unknown operationId", async () => {
    vi.spyOn(specLoader, "loadSpec").mockResolvedValue({
      operations: [],
      openapi: { openapi: "3.0.0", info: { title: "x", version: "1" }, paths: {}, components: { schemas: {} } },
      rawSource: {},
    });
    const out = await handleClawqlExecuteToolInput({
      operationId: "missing.op",
      args: {},
    });
    const body = JSON.parse(out.content[0].text) as { error: string };
    expect(body.error).toContain("Unknown operationId");
  });

  it("handleClawqlExecuteToolInput uses REST in multi-spec mode", async () => {
    await withFetchServer(
      async (req) => {
        const path = new URL(req.url).pathname;
        if (req.method === "GET" && path.startsWith("/pets")) {
          return new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response("not found", { status: 404 });
      },
      async (origin) => {
        const openapi: OpenAPIDoc = {
          openapi: "3.0.3",
          info: { title: "Pet", version: "1" },
          servers: [{ url: origin }],
          paths: {
            "/pets": {
              get: {
                operationId: "listPets",
                responses: { "200": { description: "ok" } },
              },
            },
          },
          components: { schemas: {} },
        };

        vi.spyOn(specLoader, "loadSpec").mockResolvedValue({
          operations: [
            {
              id: "alpha::listPets",
              method: "GET",
              path: "/pets",
              flatPath: "/pets",
              description: "list",
              resource: "pets",
              parameters: {},
              specIndex: 0,
              specLabel: "alpha",
            } as Operation,
          ],
          openapi,
          openapis: [openapi],
          multi: true,
          rawSource: {},
        });

        const out = await handleClawqlExecuteToolInput({
          operationId: "alpha::listPets",
          args: {},
        });
        const data = JSON.parse(out.content[0].text) as { ok: boolean };
        expect(data.ok).toBe(true);
      }
    );
  });
});
