/**
 * Memory REST + enrichment unit tests (mocked gateway).
 */

import { createServer, request, type Server } from "node:http";
import { once } from "node:events";
import express from "express";
import { describe, expect, it } from "vitest";
import { createMemoryRouter } from "./router.js";
import {
  MEMORY_CONTEXT_BEGIN,
  maybeEnrichMessages,
  memoryEnrichmentRequested,
} from "./enrichment.js";
import type { ChatMessage } from "../gateway.js";

function closeHttpServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof server.closeIdleConnections === "function") {
      server.closeIdleConnections();
    }
    server.close((err) => (err ? reject(err) : resolve()));
  });
}

async function httpJson(
  url: string,
  init?: { method?: string; body?: string; headers?: Record<string, string> }
): Promise<{
  status: number;
  body: unknown;
  headers: Record<string, string | string[] | undefined>;
}> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = { ...init?.headers };
    if (init?.body) headers["Content-Type"] = "application/json";
    const req = request(
      url,
      {
        method: init?.method ?? "GET",
        headers: Object.keys(headers).length ? headers : undefined,
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => {
          resolve({
            status: res.statusCode ?? 0,
            body: data ? (JSON.parse(data) as unknown) : null,
            headers: res.headers as Record<string, string | string[] | undefined>,
          });
        });
      }
    );
    req.on("error", reject);
    if (init?.body) req.write(init.body);
    req.end();
  });
}

describe("memoryEnrichmentRequested", () => {
  it("defaults off; header or env opt-in", () => {
    const req = {
      header: (name: string) => (name === "x-clawql-memory-enrich" ? undefined : undefined),
    } as Parameters<typeof memoryEnrichmentRequested>[0];
    expect(memoryEnrichmentRequested(req, {})).toBe(false);
    expect(memoryEnrichmentRequested(req, { CLAWQL_INFERENCE_MEMORY_ENRICH: "1" })).toBe(true);
    const reqOn = {
      header: (name: string) => (name === "x-clawql-memory-enrich" ? "1" : undefined),
    } as Parameters<typeof memoryEnrichmentRequested>[0];
    expect(memoryEnrichmentRequested(reqOn, {})).toBe(true);
  });
});

describe("maybeEnrichMessages", () => {
  it("skips when vault unset (store down)", async () => {
    const messages: ChatMessage[] = [{ role: "user", content: "hello" }];
    const req = {
      header: () => "1",
    } as Parameters<typeof maybeEnrichMessages>[0]["req"];
    const decision = await maybeEnrichMessages({
      messages,
      req,
      env: {},
    });
    expect(decision.kind).toBe("skip");
  });

  it("injects marked system block and memory ids", async () => {
    const messages: ChatMessage[] = [{ role: "user", content: "github" }];
    const req = {
      header: () => "1",
    } as Parameters<typeof maybeEnrichMessages>[0]["req"];
    const decision = await maybeEnrichMessages({
      messages,
      req,
      env: { CLAWQL_OBSIDIAN_VAULT_PATH: "/tmp/vault" },
      search: async () => ({
        ok: true,
        query: "github",
        results: [
          {
            path: "Memory/github.md",
            score: 3,
            depth: 0,
            reason: "keyword" as const,
            snippet: "github merge notes",
          },
        ],
      }),
    });
    expect(decision.kind).toBe("inject");
    if (decision.kind !== "inject") return;
    expect(decision.memoryIds).toEqual(["Memory/github.md"]);
    expect(decision.messages[0]?.role).toBe("system");
    expect(decision.messages[0]?.content).toContain(MEMORY_CONTEXT_BEGIN);
  });

  it("fail-closes on redact/screen errors", async () => {
    const messages: ChatMessage[] = [{ role: "user", content: "secret" }];
    const req = {
      header: () => "1",
    } as Parameters<typeof maybeEnrichMessages>[0]["req"];
    const decision = await maybeEnrichMessages({
      messages,
      req,
      env: { CLAWQL_OBSIDIAN_VAULT_PATH: "/tmp/vault" },
      search: async () => ({
        ok: false,
        query: "secret",
        error: "presidio redact blocked",
        results: [],
      }),
    });
    expect(decision).toEqual({ kind: "fail_closed", error: "presidio redact blocked" });
  });
});

describe("createMemoryRouter", () => {
  it("serves ingest/search/list/get/erase via injected façades", async () => {
    const notes = new Map<string, string>();
    const app = express();
    app.use(express.json());
    app.use(
      createMemoryRouter({
        ingest: async (input) => {
          const path = `Memory/${input.title.toLowerCase().replace(/\s+/g, "-")}.md`;
          notes.set(path, input.insights ?? "");
          return { ok: true, path };
        },
        search: async (input) => ({
          ok: true,
          query: input.query,
          results: [...notes.entries()]
            .filter(
              ([p]) => p.includes(input.query.toLowerCase()) || notes.get(p)?.includes(input.query)
            )
            .map(([path, snippet]) => ({
              path,
              score: 1,
              depth: 0,
              reason: "keyword" as const,
              snippet,
            })),
        }),
        list: async () => ({
          ok: true,
          entries: [...notes.keys()].map((path) => ({
            path,
            slug: path.replace(/^Memory\//, "").replace(/\.md$/, ""),
          })),
        }),
        get: async (slug) => {
          const path = slug.startsWith("Memory/") ? slug : `Memory/${slug}.md`;
          const content = notes.get(path);
          if (!content && content !== "") {
            return { ok: false as const, error: "not found", status: 404 };
          }
          return { ok: true as const, path, slug, content: content ?? "" };
        },
        erase: async (slug) => {
          const path = slug.startsWith("Memory/") ? slug : `Memory/${slug}.md`;
          if (!notes.has(path)) return { ok: false as const, error: "not found", status: 404 };
          notes.delete(path);
          return { ok: true as const, path, erased: true as const };
        },
      })
    );
    const server = createServer(app);
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("expected port");
    const base = `http://127.0.0.1:${address.port}`;

    try {
      const ingest = await httpJson(`${base}/memory/ingest`, {
        method: "POST",
        body: JSON.stringify({ title: "Hello World", insights: "note body" }),
      });
      expect(ingest.status).toBe(201);
      expect((ingest.body as { path: string }).path).toBe("Memory/hello-world.md");

      const list = await httpJson(`${base}/memory`);
      expect(list.status).toBe(200);
      expect((list.body as { data: unknown[] }).data).toHaveLength(1);

      const search = await httpJson(`${base}/memory/search`, {
        method: "POST",
        body: JSON.stringify({ query: "hello" }),
      });
      expect(search.status).toBe(200);

      const get = await httpJson(`${base}/memory/hello-world`);
      expect(get.status).toBe(200);
      expect((get.body as { content: string }).content).toBe("note body");

      const erased = await httpJson(`${base}/memory/hello-world`, { method: "DELETE" });
      expect(erased.status).toBe(200);
      expect((erased.body as { erased: boolean }).erased).toBe(true);

      const gone = await httpJson(`${base}/memory/hello-world`);
      expect(gone.status).toBe(404);
    } finally {
      await closeHttpServer(server);
    }
  });
});
