/**
 * Task API, board page (static), approval page, optional MCP tools.
 * Day-1: routing skeleton; Day-2+ wires coordinator / decider.
 */

import { shouldAutoMerge, type DecisionResponse } from "@artifacts-attempts/shared";

export interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
  COORDINATOR?: DurableObjectNamespace;
  DECISIONS_URL?: string;
  DECISIONS_MIN_CONFIDENCE?: string;
}

const tasks = new Map<string, unknown>();

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === "/tasks") {
      const body = (await request.json()) as {
        repo: string;
        prompt: string;
        attempts?: number;
      };
      const id = `tsk_${crypto.randomUUID().slice(0, 4)}`;
      const task = {
        id,
        repo: body.repo,
        baseCommit: "pending",
        prompt: body.prompt,
        attempts: body.attempts ?? 3,
        status: "open",
      };
      tasks.set(id, task);
      // Coordinator fork wiring lands Day 2.
      return Response.json(task, { status: 201 });
    }

    const taskMatch = url.pathname.match(/^\/tasks\/([^/]+)$/);
    if (request.method === "GET" && taskMatch) {
      const task = tasks.get(taskMatch[1]!);
      if (!task) return new Response("Not found", { status: 404 });
      return Response.json(task);
    }

    if (request.method === "POST" && url.pathname.match(/^\/tasks\/[^/]+\/approve$/)) {
      return Response.json({ ok: true, status: "merging" });
    }

    if (request.method === "POST" && url.pathname.match(/^\/tasks\/[^/]+\/decline$/)) {
      return Response.json({ ok: true, status: "failed" });
    }

    if (url.pathname === "/healthz") {
      return Response.json({
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
