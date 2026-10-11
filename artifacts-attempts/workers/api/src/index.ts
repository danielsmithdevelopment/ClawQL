/**
 * Task API, board page (static), approval page, SSE stream.
 * Local/demo: in-memory task-store. Production: coordinator DO + decider.
 */

import { dispatchTool, type ToolContext } from "@artifacts-attempts/mcp-tools";
import { shouldAutoMerge, type DecisionResponse } from "@artifacts-attempts/shared";
import { getTaskView, putTaskView, subscribe, type TaskView } from "./task-store.js";

const claimedByTask = new Map<string, Map<string, string>>();

export interface Env {
  ASSETS?: { fetch(request: Request): Promise<Response> };
  COORDINATOR?: DurableObjectNamespace;
  DECISIONS_URL?: string;
  DECISIONS_MIN_CONFIDENCE?: string;
}

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === "/tasks") {
      const body = (await request.json()) as {
        repo: string;
        prompt: string;
        attempts?: number;
        /** Optional: hydrate from a completed local demo for the board */
        view?: TaskView;
      };
      if (body.view) {
        putTaskView(body.view);
        return json(body.view, 201);
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
      putTaskView(view);
      return json(view, 201);
    }

    const streamMatch = url.pathname.match(/^\/tasks\/([^/]+)\/stream$/);
    if (request.method === "GET" && streamMatch) {
      const id = streamMatch[1]!;
      const stream = new ReadableStream({
        start(controller) {
          const enc = new TextEncoder();
          const send = (view: TaskView) => {
            controller.enqueue(enc.encode(`data: ${JSON.stringify(view)}\n\n`));
          };
          const existing = getTaskView(id);
          if (existing) send(existing);
          const unsub = subscribe(id, send);
          const keep = setInterval(() => controller.enqueue(enc.encode(": ping\n\n")), 15_000);
          request.signal.addEventListener("abort", () => {
            clearInterval(keep);
            unsub();
            controller.close();
          });
        },
      });
      return new Response(stream, {
        headers: {
          "content-type": "text/event-stream",
          "cache-control": "no-cache",
          connection: "keep-alive",
        },
      });
    }

    const taskMatch = url.pathname.match(/^\/tasks\/([^/]+)$/);
    if (request.method === "GET" && taskMatch) {
      const view = getTaskView(taskMatch[1]!);
      if (!view) return new Response("Not found", { status: 404 });
      return json(view);
    }

    const approveMatch = url.pathname.match(/^\/tasks\/([^/]+)\/approve$/);
    if (request.method === "POST" && approveMatch) {
      const view = getTaskView(approveMatch[1]!);
      if (!view) return new Response("Not found", { status: 404 });
      view.pendingApproval = false;
      view.task = { ...view.task, status: "merging" };
      putTaskView(view);
      return json({ ok: true, status: "merging" });
    }

    const declineMatch = url.pathname.match(/^\/tasks\/([^/]+)\/decline$/);
    if (request.method === "POST" && declineMatch) {
      const view = getTaskView(declineMatch[1]!);
      if (!view) return new Response("Not found", { status: 404 });
      view.pendingApproval = false;
      view.task = { ...view.task, status: "failed" };
      putTaskView(view);
      return json({ ok: true, status: "failed" });
    }

    if (url.pathname.startsWith("/releases/")) {
      const id = url.pathname.slice("/releases/".length);
      return json({
        arweaveId: id,
        note: "Serve manifest from R2 / dry-run .local/arweave in deploy wiring",
      });
    }

    if (request.method === "POST" && url.pathname === "/mcp/tools/call") {
      const body = (await request.json()) as {
        taskId: string;
        attemptId: string;
        name: string;
        arguments?: Record<string, unknown>;
      };
      const view = getTaskView(body.taskId);
      if (!view) return new Response("Not found", { status: 404 });
      const claimed = claimedByTask.get(body.taskId) ?? new Map<string, string>();
      claimedByTask.set(body.taskId, claimed);
      const ctx: ToolContext = {
        task: view.task,
        attempts: view.attempts,
        notes: view.notes,
        selfAttemptId: body.attemptId,
        claimedPaths: claimed,
      };
      return json(dispatchTool(ctx, body.name, body.arguments ?? {}));
    }

    if (url.pathname === "/healthz") {
      return json({
        ok: true,
        decisionsUrl: env.DECISIONS_URL ?? null,
        trustProbe: shouldAutoMerge({
          decision: { winner: "att_1" } satisfies DecisionResponse,
          winnerTestsFailed: 0,
          winnerPolicyClean: true,
        }),
      });
    }

    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }
    return new Response("artifacts-attempts api", { status: 200 });
  },
};
