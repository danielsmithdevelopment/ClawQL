/**
 * Express router for /memory REST façade over clawql-memory.
 */

import express, { type Request, type Response } from "express";
import type { MemoryIngestInput } from "clawql-memory/ingest/ingest";
import type { MemoryRecallInput } from "clawql-memory/recall/recall";
import type { VirtualKeyRequest } from "../api/auth.js";
import { sendOpenAiError } from "../api/openai-errors.js";
import { resolveMemoryScope } from "./scope.js";
import {
  runMemoryGatewayErase,
  runMemoryGatewayGet,
  runMemoryGatewayIngest,
  runMemoryGatewayList,
  runMemoryGatewaySearch,
} from "./service.js";

export type CreateMemoryRouterOptions = {
  env?: NodeJS.ProcessEnv;
  ingest?: typeof runMemoryGatewayIngest;
  search?: typeof runMemoryGatewaySearch;
  list?: typeof runMemoryGatewayList;
  get?: typeof runMemoryGatewayGet;
  erase?: typeof runMemoryGatewayErase;
};

function parseIngestBody(body: unknown): MemoryIngestInput | { error: string } {
  if (!body || typeof body !== "object") return { error: "JSON body required" };
  const b = body as Record<string, unknown>;
  const title = typeof b.title === "string" ? b.title.trim() : "";
  if (!title) return { error: "title is required" };
  return {
    title,
    type: typeof b.type === "string" ? b.type : undefined,
    description: typeof b.description === "string" ? b.description : undefined,
    insights: typeof b.insights === "string" ? b.insights : undefined,
    conversation: typeof b.conversation === "string" ? b.conversation : undefined,
    toolOutputs:
      typeof b.toolOutputs === "string" || Array.isArray(b.toolOutputs)
        ? (b.toolOutputs as string | string[])
        : undefined,
    wikilinks: Array.isArray(b.wikilinks)
      ? b.wikilinks.filter((x): x is string => typeof x === "string")
      : undefined,
    sessionId: typeof b.sessionId === "string" ? b.sessionId : undefined,
    correlationId: typeof b.correlationId === "string" ? b.correlationId : undefined,
    agentId: typeof b.agentId === "string" ? b.agentId : undefined,
    append: typeof b.append === "boolean" ? b.append : undefined,
    tags: Array.isArray(b.tags)
      ? b.tags.filter((x): x is string => typeof x === "string")
      : undefined,
    folder: typeof b.folder === "string" ? b.folder : undefined,
  };
}

function parseSearchBody(body: unknown): MemoryRecallInput | { error: string } {
  if (!body || typeof body !== "object") return { error: "JSON body required" };
  const b = body as Record<string, unknown>;
  const query = typeof b.query === "string" ? b.query.trim() : "";
  if (!query) return { error: "query is required" };
  return {
    query,
    limit: typeof b.limit === "number" ? b.limit : undefined,
    maxDepth: typeof b.maxDepth === "number" ? b.maxDepth : undefined,
    minScore: typeof b.minScore === "number" ? b.minScore : undefined,
    includeCodeGraph: typeof b.includeCodeGraph === "boolean" ? b.includeCodeGraph : undefined,
    codeGraphId: typeof b.codeGraphId === "string" ? b.codeGraphId : undefined,
    sources: Array.isArray(b.sources)
      ? (b.sources.filter(
          (x): x is string => typeof x === "string"
        ) as MemoryRecallInput["sources"])
      : undefined,
    schema: typeof b.schema === "string" ? b.schema : undefined,
    filters:
      b.filters && typeof b.filters === "object"
        ? (b.filters as MemoryRecallInput["filters"])
        : undefined,
  };
}

function scopeFromReq(req: VirtualKeyRequest): string | undefined {
  return resolveMemoryScope(req.virtualKey);
}

export function createMemoryRouter(options: CreateMemoryRouterOptions = {}): express.Router {
  const router = express.Router();
  const ingest = options.ingest ?? runMemoryGatewayIngest;
  const search = options.search ?? runMemoryGatewaySearch;
  const list = options.list ?? runMemoryGatewayList;
  const get = options.get ?? runMemoryGatewayGet;
  const erase = options.erase ?? runMemoryGatewayErase;

  router.get("/memory", async (req: VirtualKeyRequest, res: Response) => {
    const result = await list(scopeFromReq(req));
    if (!result.ok) {
      sendOpenAiError(res, 503, result.error, "server_error");
      return;
    }
    res.json({
      object: "clawql.memory.list",
      data: result.entries,
    });
  });

  router.post("/memory/ingest", async (req: VirtualKeyRequest, res: Response) => {
    const parsed = parseIngestBody(req.body);
    if ("error" in parsed) {
      sendOpenAiError(res, 400, parsed.error, "invalid_request_error");
      return;
    }
    const scope = scopeFromReq(req);
    if (scope && !parsed.folder) {
      parsed.folder = scope;
    }
    if (req.virtualKey?.team && !parsed.agentId) {
      parsed.agentId = `vk:${req.virtualKey.team}`;
    }
    const result = await ingest(parsed);
    if (!result.ok) {
      sendOpenAiError(res, 502, result.error ?? "ingest failed", "server_error");
      return;
    }
    res.status(result.skipped ? 200 : 201).json({ object: "clawql.memory.ingest", ...result });
  });

  router.post("/memory/search", async (req: VirtualKeyRequest, res: Response) => {
    const parsed = parseSearchBody(req.body);
    if ("error" in parsed) {
      sendOpenAiError(res, 400, parsed.error, "invalid_request_error");
      return;
    }
    const result = await search(parsed, scopeFromReq(req));
    if (!result.ok) {
      sendOpenAiError(res, 502, result.error ?? "search failed", "server_error");
      return;
    }
    res.json({ object: "clawql.memory.search", ...result });
  });

  router.get("/memory/:slug", async (req: VirtualKeyRequest, res: Response) => {
    const raw = req.params.slug;
    const slug = Array.isArray(raw) ? (raw[0] ?? "") : (raw ?? "");
    const result = await get(slug, scopeFromReq(req));
    if (!result.ok) {
      sendOpenAiError(res, result.status ?? 502, result.error, "invalid_request_error");
      return;
    }
    res.json({ object: "clawql.memory", ...result });
  });

  router.delete("/memory/:slug", async (req: VirtualKeyRequest, res: Response) => {
    const raw = req.params.slug;
    const slug = Array.isArray(raw) ? (raw[0] ?? "") : (raw ?? "");
    const result = await erase(slug, scopeFromReq(req));
    if (!result.ok) {
      sendOpenAiError(res, result.status, result.error, "invalid_request_error");
      return;
    }
    res.json({ object: "clawql.memory.erase", ...result });
  });

  return router;
}
