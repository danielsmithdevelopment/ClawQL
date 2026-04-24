/**
 * GitHub #138: single-spec `notify` → `execute` uses in-process OpenAPI→GraphQL first.
 * Asserts the loopback stub is hit and `executeRestOperation` is not used (no REST fallback).
 *
 * Uses **`minimal-slack-chat-postmessage.json`** (not the full **`providers/slack/openapi.json`**):
 * the full Slack spec fails **`@omnigraph/json-schema`** on Node 25 (`getUnionTypeComposers` —
 * see **`docs/graphql-mesh-node-compatibility.md`**).
 */

import { createServer, type Server } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { executeOperationGraphQL } from "./graphql-in-process-execute.js";
import * as restOperation from "./rest-operation.js";
import { loadSpec, resetSpecCache } from "./spec-loader.js";
import { executeOutputFields, handleNotifyToolInput, resetSchemaFieldCache } from "./tools.js";

const here = dirname(fileURLToPath(import.meta.url));
const minimalSlackChatPostMessage = join(
  here,
  "test-utils",
  "fixtures",
  "minimal-slack-chat-postmessage.json"
);

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof server.closeAllConnections === "function") {
      server.closeAllConnections();
    }
    server.close((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

describe("notify GraphQL execute path (#138)", () => {
  const saved: Record<string, string | undefined> = {};
  let restSpy: ReturnType<typeof vi.spyOn<typeof restOperation, "executeRestOperation">>;

  beforeEach(() => {
    for (const k of [
      "CLAWQL_SPEC_PATH",
      "CLAWQL_PROVIDER",
      "CLAWQL_SPEC_PATHS",
      "CLAWQL_SLACK_TOKEN",
      "CLAWQL_API_BASE_URL",
      "API_BASE_URL",
      "CLAWQL_TEST_SLACK_FETCH_STUB",
      "CLAWQL_TEST_SLACK_FETCH_BODY",
      "CLAWQL_TEST_SLACK_FETCH_HTTP_OK",
      "CLAWQL_TEST_ONYX_FETCH_STUB",
      "CLAWQL_TEST_ONYX_FETCH_BODY",
      "CLAWQL_TEST_ONYX_FETCH_HTTP_OK",
    ] as const) {
      saved[k] = process.env[k];
    }
    process.env.CLAWQL_SPEC_PATH = minimalSlackChatPostMessage;
    delete process.env.CLAWQL_PROVIDER;
    delete process.env.CLAWQL_SPEC_PATHS;
    process.env.CLAWQL_SLACK_TOKEN = "xoxb-test-not-a-real-token";
    delete process.env.CLAWQL_API_BASE_URL;
    delete process.env.API_BASE_URL;
    delete process.env.CLAWQL_TEST_SLACK_FETCH_STUB;
    delete process.env.CLAWQL_TEST_SLACK_FETCH_BODY;
    delete process.env.CLAWQL_TEST_SLACK_FETCH_HTTP_OK;
    delete process.env.CLAWQL_TEST_ONYX_FETCH_STUB;
    delete process.env.CLAWQL_TEST_ONYX_FETCH_BODY;
    delete process.env.CLAWQL_TEST_ONYX_FETCH_HTTP_OK;
    resetSpecCache();
    resetSchemaFieldCache();
    restSpy = vi.spyOn(restOperation, "executeRestOperation");
  });

  afterEach(() => {
    restSpy.mockRestore();
    for (const key of Object.keys(saved)) {
      const v = saved[key];
      if (v === undefined) delete process.env[key];
      else process.env[key] = v;
    }
    resetSpecCache();
    resetSchemaFieldCache();
  });

  it("executeOperationGraphQL(chat_postMessage) hits stub without REST (sanity)", async () => {
    const server = createServer((req, res) => {
      if (req.method !== "POST") {
        res.writeHead(405).end();
        return;
      }
      req.on("data", () => {});
      req.on("end", () => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, channel: "C99", ts: "9.9", message: {} }));
      });
    });
    await new Promise<void>((resolve, reject) => {
      server.listen(0, "127.0.0.1", () => resolve());
      server.on("error", reject);
    });
    const addr = server.address();
    const port = typeof addr === "object" && addr ? addr.port : 0;
    process.env.CLAWQL_API_BASE_URL = `http://127.0.0.1:${port}`;
    try {
      const loaded = await loadSpec();
      const op = loaded.operations.find((o) => o.id === "chat_postMessage");
      expect(op).toBeDefined();
      const fields = executeOutputFields("chat_postMessage", undefined)?.join("\n        ") ?? "ok";
      const r = await executeOperationGraphQL(
        loaded.openapi,
        process.env.CLAWQL_API_BASE_URL!,
        op!,
        { channel: "C99", text: "t" },
        fields
      );
      expect(r).toEqual({
        ok: true,
        data: expect.objectContaining({ ok: true, channel: "C99", ts: "9.9" }),
      });
      expect(restSpy).not.toHaveBeenCalled();
    } finally {
      await closeServer(server);
      delete process.env.CLAWQL_API_BASE_URL;
    }
  }, 30_000);

  it("handleNotifyToolInput succeeds via GraphQL only (stub upstream on loopback)", async () => {
    const state = { posts: 0, paths: [] as string[] };

    const server = createServer((req, res) => {
      if (req.method !== "POST") {
        res.writeHead(405).end();
        return;
      }
      state.paths.push(req.url ?? "");
      req.on("data", () => {});
      req.on("end", () => {
        state.posts += 1;
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            ok: true,
            channel: "C01234567",
            ts: "1713898123.000888",
            message: { text: "stubbed-upstream" },
          })
        );
      });
    });

    await new Promise<void>((resolve, reject) => {
      server.listen(0, "127.0.0.1", () => resolve());
      server.on("error", reject);
    });
    const addr = server.address();
    const port = typeof addr === "object" && addr ? addr.port : 0;
    process.env.CLAWQL_API_BASE_URL = `http://127.0.0.1:${port}`;

    try {
      const out = await handleNotifyToolInput({ channel: "C01234567", text: "hello graphql path" });
      expect(restSpy).not.toHaveBeenCalled();
      expect(state.posts).toBeGreaterThanOrEqual(1);
      expect(state.paths.some((p) => p.includes("chat.postMessage"))).toBe(true);

      const j = JSON.parse(out.content[0]!.text) as {
        ok?: boolean;
        channel?: string;
        ts?: string;
      };
      expect(j.ok).toBe(true);
      expect(j.channel).toBe("C01234567");
      expect(j.ts).toBe("1713898123.000888");
    } finally {
      await closeServer(server);
    }
  }, 60_000);
});
