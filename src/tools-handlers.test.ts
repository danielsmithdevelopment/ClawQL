import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as specLoader from "./spec-loader.js";
import { resetSpecCache } from "./spec-loader.js";
import type { OpenAPIDoc } from "./spec-loader.js";
import type { Operation } from "./spec-loader.js";
import { handleMemoryIngestToolInput } from "./memory-ingest.js";
import { handleMemoryRecallToolInput } from "./memory-recall.js";
import { handleClawqlCodeToolInput } from "./sandbox-bridge-client.js";
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

  it("handleClawqlExecuteToolInput uses in-process GraphQL when CLAWQL_COMBINED_MODE=1", async () => {
    const prevCombined = process.env.CLAWQL_COMBINED_MODE;
    process.env.CLAWQL_COMBINED_MODE = "1";
    try {
      await withFetchServer(
        async (req) => {
          const path = new URL(req.url).pathname;
          if (req.method === "GET" && path.startsWith("/pets")) {
            return new Response(JSON.stringify([{ id: 1, name: "dog" }]), {
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
                  responses: {
                    "200": {
                      description: "ok",
                      content: {
                        "application/json": {
                          schema: {
                            type: "array",
                            items: { type: "object", additionalProperties: true },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
            components: { schemas: {} },
          };

          vi.spyOn(specLoader, "loadSpec").mockResolvedValue({
            operations: [
              {
                id: "listPets",
                method: "GET",
                path: "/pets",
                flatPath: "/pets",
                description: "list",
                resource: "pets",
                parameters: {},
              } as Operation,
            ],
            openapi,
            multi: false,
            rawSource: {},
          });

          resetSpecCache();
          resetSchemaFieldCache();

          const out = await handleClawqlExecuteToolInput({
            operationId: "listPets",
            args: {},
          });
          const data = JSON.parse(out.content[0].text) as unknown;
          expect(Array.isArray(data)).toBe(true);
          expect((data as { name: string }[])[0]?.name).toBe("dog");
        }
      );
    } finally {
      if (prevCombined === undefined) delete process.env.CLAWQL_COMBINED_MODE;
      else process.env.CLAWQL_COMBINED_MODE = prevCombined;
    }
  });
});

describe("optional tool handlers (MCP content shape)", () => {
  describe("handleClawqlCodeToolInput (MCP sandbox_exec)", () => {
    const saved: Record<string, string | undefined> = {};

    beforeEach(() => {
      saved.CLAWQL_SANDBOX_BRIDGE_URL = process.env.CLAWQL_SANDBOX_BRIDGE_URL;
      saved.CLAWQL_CLOUDFLARE_SANDBOX_API_TOKEN = process.env.CLAWQL_CLOUDFLARE_SANDBOX_API_TOKEN;
      delete process.env.CLAWQL_SANDBOX_BRIDGE_URL;
      delete process.env.CLAWQL_CLOUDFLARE_SANDBOX_API_TOKEN;
    });

    afterEach(() => {
      vi.restoreAllMocks();
      for (const key of Object.keys(saved)) {
        const v = saved[key as keyof typeof saved];
        if (v === undefined) delete process.env[key];
        else process.env[key] = v;
      }
    });

    it("returns text content with JSON from mocked bridge (no network)", async () => {
      process.env.CLAWQL_SANDBOX_BRIDGE_URL = "https://bridge.example.test";
      process.env.CLAWQL_CLOUDFLARE_SANDBOX_API_TOKEN = "secret";
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(
          JSON.stringify({
            stdout: "hi\n",
            stderr: "",
            exitCode: 0,
            success: true,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );

      const out = await handleClawqlCodeToolInput({
        code: "print(1)",
        language: "python",
      });
      expect(out.content).toHaveLength(1);
      expect(out.content[0].type).toBe("text");
      const parsed = JSON.parse(out.content[0].text) as { success: boolean; stdout: string };
      expect(parsed.success).toBe(true);
      expect(parsed.stdout).toBe("hi\n");
    });

    it("returns JSON error when bridge URL is not configured", async () => {
      const out = await handleClawqlCodeToolInput({ code: "x", language: "shell" });
      const parsed = JSON.parse(out.content[0].text) as { success: boolean; error?: string };
      expect(parsed.success).toBe(false);
      expect(parsed.error).toMatch(/CLAWQL_SANDBOX_BRIDGE_URL/);
    });
  });

  describe("handleMemoryIngestToolInput", () => {
    const savedVault = process.env.CLAWQL_OBSIDIAN_VAULT_PATH;
    let dir: string;

    beforeEach(async () => {
      dir = await mkdtemp(join(tmpdir(), "clawql-vault-"));
      process.env.CLAWQL_OBSIDIAN_VAULT_PATH = dir;
    });

    afterEach(async () => {
      if (savedVault === undefined) delete process.env.CLAWQL_OBSIDIAN_VAULT_PATH;
      else process.env.CLAWQL_OBSIDIAN_VAULT_PATH = savedVault;
      await rm(dir, { recursive: true, force: true });
    });

    it("returns MCP text with ingest result JSON", async () => {
      const out = await handleMemoryIngestToolInput({
        title: "Handler Note",
        insights: "from tools-handlers test",
      });
      expect(out.content[0].type).toBe("text");
      const parsed = JSON.parse(out.content[0].text) as { ok: boolean; path?: string };
      expect(parsed.ok).toBe(true);
      expect(parsed.path).toBe("Memory/handler-note.md");
    });

    it("returns ok false when vault is not configured", async () => {
      delete process.env.CLAWQL_OBSIDIAN_VAULT_PATH;
      const out = await handleMemoryIngestToolInput({ title: "X" });
      const parsed = JSON.parse(out.content[0].text) as { ok: boolean; error?: string };
      expect(parsed.ok).toBe(false);
      expect(parsed.error).toMatch(/CLAWQL_OBSIDIAN_VAULT_PATH/);
    });
  });

  describe("handleMemoryRecallToolInput", () => {
    const savedVault = process.env.CLAWQL_OBSIDIAN_VAULT_PATH;
    let dir: string;

    beforeEach(async () => {
      dir = await mkdtemp(join(tmpdir(), "clawql-vault-"));
      process.env.CLAWQL_OBSIDIAN_VAULT_PATH = dir;
      await mkdir(join(dir, "Memory"), { recursive: true });
      await writeFile(
        join(dir, "Memory/note-a.md"),
        ["# A", "", "keyword match pat rotation [[Note B]]", ""].join("\n"),
        "utf8"
      );
      await writeFile(join(dir, "Memory/note-b.md"), ["# B", "", "body b", ""].join("\n"), "utf8");
    });

    afterEach(async () => {
      if (savedVault === undefined) delete process.env.CLAWQL_OBSIDIAN_VAULT_PATH;
      else process.env.CLAWQL_OBSIDIAN_VAULT_PATH = savedVault;
      await rm(dir, { recursive: true, force: true });
    });

    it("returns MCP text with recall result JSON", async () => {
      const out = await handleMemoryRecallToolInput({
        query: "pat rotation",
        limit: 5,
        maxDepth: 2,
        minScore: 1,
      });
      expect(out.content[0].type).toBe("text");
      const parsed = JSON.parse(out.content[0].text) as {
        ok: boolean;
        results?: { path: string }[];
      };
      expect(parsed.ok).toBe(true);
      expect(parsed.results?.length).toBeGreaterThanOrEqual(1);
    });

    it("returns ok false when vault is not configured", async () => {
      delete process.env.CLAWQL_OBSIDIAN_VAULT_PATH;
      const out = await handleMemoryRecallToolInput({ query: "x" });
      const parsed = JSON.parse(out.content[0].text) as { ok: boolean; error?: string };
      expect(parsed.ok).toBe(false);
      expect(parsed.error).toMatch(/CLAWQL_OBSIDIAN_VAULT_PATH/);
    });
  });
});
