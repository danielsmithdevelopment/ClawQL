/**
 * Express router for POST /decision and POST /v1/systemone (alias).
 * Thin host façade over DecisionGatewayService.
 */

import express, { type Request, type Response } from "express";
import type { VirtualKeyRequest } from "../api/auth.js";
import { sendOpenAiError } from "../api/openai-errors.js";
import {
  runDecision,
  type DecisionQuestion,
  type DecisionRequest,
  type DecisionResponse,
} from "./service.js";

export type CreateDecisionRouterOptions = {
  env?: NodeJS.ProcessEnv;
  /** Override decide (tests). */
  decide?: (req: DecisionRequest) => Promise<DecisionResponse>;
};

function parseQuestions(raw: unknown): DecisionQuestion[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const out: DecisionQuestion[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") return null;
    const q = item as Record<string, unknown>;
    const name = typeof q.name === "string" ? q.name.trim() : "";
    if (!name) return null;
    if (q.type === "choice") {
      if (!Array.isArray(q.options) || q.options.length === 0) return null;
      const options = q.options.map((o) => {
        if (!o || typeof o !== "object") return null;
        const opt = o as Record<string, unknown>;
        const id = typeof opt.id === "string" ? opt.id.trim() : "";
        if (!id) return null;
        return {
          id,
          description: typeof opt.description === "string" ? opt.description : undefined,
        };
      });
      if (options.some((o) => o === null)) return null;
      out.push({
        type: "choice",
        name,
        options: options as Array<{ id: string; description?: string }>,
      });
      continue;
    }
    if (q.type === "noul") {
      const statement = typeof q.statement === "string" ? q.statement.trim() : "";
      if (!statement) return null;
      out.push({ type: "noul", name, statement });
      continue;
    }
    // score deferred per gateway-ladder spec
    return null;
  }
  return out;
}

function parseDecisionBody(
  body: unknown,
  vk?: VirtualKeyRequest["virtualKey"]
): DecisionRequest | { error: string } {
  if (!body || typeof body !== "object") return { error: "JSON body required" };
  const b = body as Record<string, unknown>;
  const state = typeof b.state === "string" ? b.state.trim() : "";
  if (!state) return { error: "state is required" };
  const questions = parseQuestions(b.questions);
  if (!questions) {
    return { error: "questions must be a non-empty array of choice|noul items" };
  }
  const escalation =
    b.escalation && typeof b.escalation === "object"
      ? (b.escalation as { mode?: "abstain" | "escalate"; model?: string })
      : undefined;
  if (escalation?.mode && escalation.mode !== "abstain" && escalation.mode !== "escalate") {
    return { error: "escalation.mode must be abstain|escalate" };
  }
  return {
    state,
    questions,
    useSiteId: typeof b.useSiteId === "string" ? b.useSiteId : undefined,
    escalation,
    sessionId: typeof b.sessionId === "string" ? b.sessionId : undefined,
    agentId: typeof b.agentId === "string" ? b.agentId : undefined,
    virtualKeyId: vk?.id,
    team: vk?.team,
  };
}

async function handleDecide(
  req: VirtualKeyRequest,
  res: Response,
  decide: (r: DecisionRequest) => Promise<DecisionResponse>
): Promise<void> {
  const parsed = parseDecisionBody(req.body, req.virtualKey);
  if ("error" in parsed) {
    sendOpenAiError(res, 400, parsed.error, "invalid_request_error");
    return;
  }
  try {
    const result = await decide(parsed);
    res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    sendOpenAiError(res, 502, message, "server_error");
  }
}

export function createDecisionRouter(options: CreateDecisionRouterOptions = {}): express.Router {
  const router = express.Router();
  const decide = options.decide ?? runDecision;

  const handler = (req: Request, res: Response) =>
    void handleDecide(req as VirtualKeyRequest, res, decide);

  router.post("/decision", handler);
  router.post("/v1/systemone", handler);

  router.get("/decision", (_req, res) => {
    res.json({
      object: "clawql.decision",
      methods: ["POST"],
      alias: "/v1/systemone",
      description:
        "System One choice|noul over Fast Decision. Only search_provider_tool_routing is productionTrusted at 8.0.0.",
    });
  });

  return router;
}
