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
  memoryEnrichmentAllowed,
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

describe("memoryEnrichmentAllowed", () => {
  it("defaults off; key policy outranks header", () => {
    const reqOff = {
      header: () => undefined,
    } as Parameters<typeof memoryEnrichmentAllowed>[0]["req"];
    expect(memoryEnrichmentAllowed({ req: reqOff, env: {} })).toBe(false);

    const reqOn = {
      header: (name: string) => (name === "x-clawql-memory-enrich" ? "1" : undefined),
    } as Parameters<typeof memoryEnrichmentAllowed>[0]["req"];

    // Keys off, no virtual key → header works
    expect(memoryEnrichmentAllowed({ req: reqOn, env: {} })).toBe(true);

    // Key present without grant → header cannot enable
    expect(
      memoryEnrichmentAllowed({
        req: reqOn,
        env: {},
        virtualKey: { id: "vk_1", team: "eng", memoryEnrichment: false, memoryScope: "eng" },
      })
    ).toBe(false);

    // Key grants enrichment → header works
    expect(
      memoryEnrichmentAllowed({
        req: reqOn,
        env: {},
        virtualKey: { id: "vk_1", team: "eng", memoryEnrichment: true, memoryScope: "eng" },
      })
    ).toBe(true);

    // Env alone cannot bypass key forbid
    expect(
      memoryEnrichmentAllowed({
        req: reqOff,
        env: { CLAWQL_INFERENCE_MEMORY_ENRICH: "1" },
        virtualKey: { id: "vk_1", team: "eng", memoryEnrichment: false },
      })
    ).toBe(false);
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

  it("injects scoped notes only, audits memory ids (no body), returns ids", async () => {
    const messages: ChatMessage[] = [{ role: "user", content: "github" }];
    const req = {
      header: () => "1",
    } as Parameters<typeof maybeEnrichMessages>[0]["req"];
    const audited: unknown[] = [];
    const decision = await maybeEnrichMessages({
      messages,
      req,
      env: { CLAWQL_OBSIDIAN_VAULT_PATH: "/tmp/vault" },
      virtualKey: {
        id: "vk_eng",
        team: "eng",
        memoryEnrichment: true,
        memoryScope: "eng",
      },
      correlationId: "corr-1",
      audit: async (p) => {
        audited.push(p);
      },
      search: async () => ({
        ok: true,
        query: "github",
        results: [
          {
            path: "Memory/eng/github.md",
            score: 3,
            depth: 0,
            reason: "keyword" as const,
            snippet: "eng github notes",
          },
          {
            path: "Memory/other/secret.md",
            score: 9,
            depth: 0,
            reason: "keyword" as const,
            snippet: "other team secret",
          },
        ],
      }),
    });
    expect(decision.kind).toBe("inject");
    if (decision.kind !== "inject") return;
    expect(decision.memoryIds).toEqual(["Memory/eng/github.md"]);
    expect(decision.messages[0]?.content).toContain(MEMORY_CONTEXT_BEGIN);
    expect(decision.messages[0]?.content).not.toContain("other team secret");
    expect(audited).toHaveLength(1);
    expect(audited[0]).toMatchObject({
      event: "memory_enrichment",
      memoryIds: ["Memory/eng/github.md"],
      memoryScope: "eng",
      virtualKeyId: "vk_eng",
    });
    expect(JSON.stringify(audited[0])).not.toContain("eng github notes");
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
          const folder = input.folder ? `${input.folder}/` : "";
          const path = `Memory/${folder}${input.title.toLowerCase().replace(/\s+/g, "-")}.md`;
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
          if (content === undefined) {
            return { ok: false as const, error: "not found", status: 404 };
          }
          return { ok: true as const, path, slug, content };
        },
        erase: async (slug) => {
          const path = slug.startsWith("Memory/") ? slug : `Memory/${slug}.md`;
          if (!notes.has(path)) return { ok: false as const, error: "not found", status: 404 };
          notes.delete(path);
          return {
            ok: true as const,
            path,
            erased: true as const,
            contentHash: "abc",
            erasedStores: { vault: true, memoryDb: true, pgvector: true, ontology: true },
          };
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
      expect((erased.body as { erasedStores?: unknown }).erasedStores).toBeTruthy();

      const gone = await httpJson(`${base}/memory/hello-world`);
      expect(gone.status).toBe(404);
    } finally {
      await closeHttpServer(server);
    }
  });
});
