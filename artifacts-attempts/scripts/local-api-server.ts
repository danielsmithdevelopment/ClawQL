#!/usr/bin/env npx tsx
/**
 * Local Node API + static board — no Wrangler / Cloudflare account required.
 * Implements the same routes as workers/api for the demo path.
 *
 *   npm run board:serve
 *   # elsewhere: npm run board:hydrate
 *   open http://127.0.0.1:8787/?task=tsk_demo
 */

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { dispatchTool, TOOL_NAMES, type ToolContext } from "@artifacts-attempts/mcp-tools";
import { shouldAutoMerge, type DecisionResponse } from "@artifacts-attempts/shared";

const HERE = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(HERE, "../workers/api/public");
const PORT = Number(process.env.PORT ?? 8787);

type TaskView = {
  task: {
    id: string;
    repo: string;
    baseCommit: string;
    prompt: string;
    attempts: number;
    status: string;
  };
  attempts: unknown[];
  notes: unknown[];
  decision?: DecisionResponse;
  pendingApproval?: boolean;
};

const store = new Map<string, TaskView>();
const listeners = new Map<string, Set<(v: TaskView) => void>>();
const claimedByTask = new Map<string, Map<string, string>>();

function put(view: TaskView): void {
  store.set(view.task.id, view);
  for (const fn of listeners.get(view.task.id) ?? []) fn(view);
}

function subscribe(id: string, fn: (v: TaskView) => void): () => void {
  const set = listeners.get(id) ?? new Set();
  set.add(fn);
  listeners.set(id, set);
  return () => set.delete(fn);
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function sendJson(res: ServerResponse, data: unknown, status = 200): void {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "content-type": "application/json",
    "access-control-allow-origin": "*",
  });
  res.end(body);
}

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
};

async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? "/", `http://127.0.0.1:${PORT}`);
  const method = req.method ?? "GET";

  if (method === "OPTIONS") {
    res.writeHead(204, {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": "content-type",
    });
    res.end();
    return;
  }

  if (method === "POST" && url.pathname === "/tasks") {
    const body = JSON.parse(await readBody(req)) as {
      repo: string;
      prompt: string;
      attempts?: number;
      view?: TaskView;
    };
    if (body.view) {
      put(body.view);
      sendJson(res, body.view, 201);
      return;
    }
    const id = `tsk_${crypto.randomUUID().replace(/-/g, "").slice(0, 4)}`;
    const view: TaskView = {
      task: {
        id,
        repo: body.repo,
        baseCommit: "pending",
        prompt: body.prompt,
        attempts: body.attempts ?? 3,
        status: "open",
      },
      attempts: [],
      notes: [],
    };
    put(view);
    sendJson(res, view, 201);
    return;
  }

  const streamMatch = url.pathname.match(/^\/tasks\/([^/]+)\/stream$/);
  if (method === "GET" && streamMatch) {
    const id = decodeURIComponent(streamMatch[1]!);
    res.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
      "access-control-allow-origin": "*",
    });
    const send = (view: TaskView) => {
      res.write(`data: ${JSON.stringify(view)}\n\n`);
    };
    const existing = store.get(id);
    if (existing) send(existing);
    const unsub = subscribe(id, send);
    const keep = setInterval(() => res.write(": ping\n\n"), 15_000);
    req.on("close", () => {
      clearInterval(keep);
      unsub();
    });
    return;
  }

  const taskMatch = url.pathname.match(/^\/tasks\/([^/]+)$/);
  if (method === "GET" && taskMatch) {
    const view = store.get(decodeURIComponent(taskMatch[1]!));
    if (!view) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    sendJson(res, view);
    return;
  }

  const approveMatch = url.pathname.match(/^\/tasks\/([^/]+)\/approve$/);
  if (method === "POST" && approveMatch) {
    const view = store.get(decodeURIComponent(approveMatch[1]!));
    if (!view) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    view.pendingApproval = false;
    view.task = { ...view.task, status: "merging" };
    put(view);
    sendJson(res, { ok: true, status: "merging" });
    return;
  }

  const declineMatch = url.pathname.match(/^\/tasks\/([^/]+)\/decline$/);
  if (method === "POST" && declineMatch) {
    const view = store.get(decodeURIComponent(declineMatch[1]!));
    if (!view) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    view.pendingApproval = false;
    view.task = { ...view.task, status: "failed" };
    put(view);
    sendJson(res, { ok: true, status: "failed" });
    return;
  }

  if (method === "GET" && url.pathname === "/mcp/tools") {
    sendJson(res, {
      tools: TOOL_NAMES.map((name) => ({
        name,
        description:
          name === "task_get"
            ? "Task prompt, base commit, caller fork"
            : name === "attempt_status"
              ? "Each attempt status + latest evidence summary"
              : name === "evidence_get"
                ? "Full evidence note for a commit"
                : "Claim file paths to surface overlap early",
      })),
      note: "Also callable via ClawQL gateway if configured; demo does not require it.",
    });
    return;
  }

  if (method === "POST" && url.pathname === "/mcp/tools/call") {
    const body = JSON.parse(await readBody(req)) as {
      taskId: string;
      attemptId: string;
      name: string;
      arguments?: Record<string, unknown>;
    };
    const view = store.get(body.taskId);
    if (!view) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    const claimed = claimedByTask.get(body.taskId) ?? new Map<string, string>();
    claimedByTask.set(body.taskId, claimed);
    const ctx: ToolContext = {
      task: view.task as ToolContext["task"],
      attempts: view.attempts as ToolContext["attempts"],
      notes: view.notes as ToolContext["notes"],
      selfAttemptId: body.attemptId,
      claimedPaths: claimed,
    };
    sendJson(res, dispatchTool(ctx, body.name, body.arguments ?? {}));
    return;
  }

  if (url.pathname === "/healthz") {
    sendJson(res, {
      ok: true,
      mode: "local-node",
      trustProbe: shouldAutoMerge({
        decision: { winner: "att_1" },
        winnerTestsFailed: 0,
        winnerPolicyClean: true,
      }),
    });
    return;
  }

  // Static board
  let path = url.pathname === "/" ? "/index.html" : url.pathname;
  if (path.includes("..")) {
    res.writeHead(400);
    res.end("bad path");
    return;
  }
  const file = join(PUBLIC, path);
  if (!existsSync(file)) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }
  const ext = extname(file);
  res.writeHead(200, { "content-type": MIME[ext] ?? "application/octet-stream" });
  res.end(readFileSync(file));
}

createServer((req, res) => {
  handler(req, res).catch((err) => {
    console.error(err);
    res.writeHead(500);
    res.end(String(err));
  });
}).listen(PORT, "127.0.0.1", () => {
  console.log(`artifacts-attempts board at http://127.0.0.1:${PORT}/`);
  console.log(`healthz http://127.0.0.1:${PORT}/healthz`);
});
