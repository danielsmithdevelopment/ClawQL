/**
 * Express router for:
 * - POST /decision and POST /v1/systemone (System One / ClawQL wire)
 * - POST /v1/decisions (OpenAI Decisions API compatible)
 */

import { randomUUID } from "node:crypto";
import express, { type Request, type Response } from "express";
import type { VirtualKeyRequest } from "../api/auth.js";
import { sendOpenAiError } from "../api/openai-errors.js";
import {
  isLunaModelId,
  parseOpenAiDecisionBody,
  toOpenAiDecisionResponse,
} from "./openai-adapt.js";
import type { OpenAiDecisionCreateRequest, OpenAiDecisionCreateResponse } from "./openai-types.js";
import {
  callRemoteOpenAiDecisions,
  enrichRemoteWithClawql,
  remoteLunaAvailable,
} from "./remote-decisions.js";
import {
  runDecision,
  type DecisionQuestion,
  type DecisionRequest,
  type DecisionResponse,
  type DecisionScoreLevel,
} from "./service.js";

export type CreateDecisionRouterOptions = {
  env?: NodeJS.ProcessEnv;
  /** Override decide (tests). */
  decide?: (req: DecisionRequest) => Promise<DecisionResponse>;
  /** Override remote Luna call (tests). */
  callRemote?: (body: OpenAiDecisionCreateRequest) => Promise<OpenAiDecisionCreateResponse>;
};

function parseQuestions(raw: unknown): DecisionQuestion[] | { error: string } {
  if (!Array.isArray(raw) || raw.length === 0) {
    return { error: "questions must be a non-empty array of choice|noul|score items" };
  }
  const out: DecisionQuestion[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") {
      return { error: "questions must be a non-empty array of choice|noul|score items" };
    }
    const q = item as Record<string, unknown>;
    const name = typeof q.name === "string" ? q.name.trim() : "";
    if (!name) {
      return { error: "each question requires a name" };
    }
    if (q.type === "choice") {
      if (!Array.isArray(q.options) || q.options.length === 0) {
        return { error: "choice questions require a non-empty options array" };
      }
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
      if (options.some((o) => o === null)) {
        return { error: "choice options require an id" };
      }
      out.push({
        type: "choice",
        name,
        instructions: typeof q.instructions === "string" ? q.instructions : undefined,
        options: options as Array<{ id: string; description?: string }>,
      });
      continue;
    }
    if (q.type === "noul" || q.type === "predicate") {
      const statement =
        (typeof q.statement === "string" && q.statement.trim()) ||
        (typeof q.instructions === "string" && q.instructions.trim()) ||
        "";
      if (!statement) {
        return { error: "noul/predicate questions require a statement or instructions" };
      }
      out.push({ type: "noul", name, statement });
      continue;
    }
    if (q.type === "score") {
      if (!Array.isArray(q.levels) || q.levels.length === 0) {
        return { error: "score questions require a non-empty levels array" };
      }
      const levels: DecisionScoreLevel[] = [];
      for (const level of q.levels) {
        if (!level || typeof level !== "object") {
          return { error: "score levels require a label" };
        }
        const lv = level as Record<string, unknown>;
        const label = typeof lv.label === "string" ? lv.label.trim() : "";
        if (!label) return { error: "score levels require a label" };
        levels.push({
          label,
          description: typeof lv.description === "string" ? lv.description : undefined,
        });
      }
      out.push({
        type: "score",
        name,
        levels,
        instructions: typeof q.instructions === "string" ? q.instructions : undefined,
      });
      continue;
    }
    return {
      error: `unsupported question type '${String(q.type)}'; only choice, noul/predicate, and score are supported`,
    };
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
  if ("error" in questions) {
    return { error: questions.error };
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

async function handleOpenAiDecisions(
  req: VirtualKeyRequest,
  res: Response,
  options: {
    decide: (r: DecisionRequest) => Promise<DecisionResponse>;
    callRemote?: (body: OpenAiDecisionCreateRequest) => Promise<OpenAiDecisionCreateResponse>;
    env: NodeJS.ProcessEnv;
  }
): Promise<void> {
  const parsed = parseOpenAiDecisionBody(req.body, req.virtualKey);
  if ("error" in parsed) {
    sendOpenAiError(res, 400, parsed.error, "invalid_request_error");
    return;
  }

  const body = req.body as OpenAiDecisionCreateRequest;
  const preferRemote = isLunaModelId(parsed.model);
  const lunaOk = remoteLunaAvailable(options.env);

  // Images: local Fast Decision is text-only. Prefer Luna when available; else refuse.
  if (parsed.hasImages && !lunaOk && !preferRemote) {
    const refusals = parsed.request.questions.map((q) => ({
      name: q.name,
      refusal:
        "Image inputs require a vision-capable decisions backend (set OPENAI_API_KEY and model=gpt-6-luna)",
    }));
    res.json(
      toOpenAiDecisionResponse({
        clawql: {
          object: "clawql.decision",
          answers: [],
          traceId: randomUUID(),
          escalated: false,
          calibrated: false,
          backendId: "none",
        },
        questions: parsed.request.questions,
        model: parsed.model,
        refusals,
      })
    );
    return;
  }

  if (parsed.hasImages && !lunaOk && preferRemote) {
    sendOpenAiError(
      res,
      503,
      "model gpt-6-luna requires OPENAI_API_KEY (or CLAWQL_DECISIONS_OPENAI_API_KEY)",
      "server_error"
    );
    return;
  }

  try {
    // Direct Luna path when model pin requests it, or images force a vision backend.
    if ((preferRemote || parsed.hasImages) && lunaOk) {
      const callRemote =
        options.callRemote ?? ((b) => callRemoteOpenAiDecisions(b, { env: options.env }));
      const remote = await callRemote({
        ...body,
        model: "gpt-6-luna",
      });
      const traceId = randomUUID();
      res.json(
        enrichRemoteWithClawql(remote, {
          useSiteId: parsed.request.useSiteId ?? "search_provider_tool_routing",
          backendId: "openai/gpt-6-luna",
          calibrated: false, // Luna probs are vendor-calibrated; site trust not yet proven
          escalated: false,
          traceId,
        })
      );
      return;
    }

    if (preferRemote && !lunaOk) {
      sendOpenAiError(
        res,
        503,
        "model gpt-6-luna requires OPENAI_API_KEY (or CLAWQL_DECISIONS_OPENAI_API_KEY)",
        "server_error"
      );
      return;
    }

    // Local Fast Decision (GLiNER / heuristic)
    const result = await options.decide(parsed.request);

    // Escalation to Luna when local abstains
    if (
      result.escalated &&
      lunaOk &&
      (parsed.request.escalation?.mode === "escalate" ||
        parsed.request.escalation?.model ||
        isLunaModelId(parsed.request.escalation?.model ?? ""))
    ) {
      const callRemote =
        options.callRemote ?? ((b) => callRemoteOpenAiDecisions(b, { env: options.env }));
      const remote = await callRemote({
        ...body,
        model: "gpt-6-luna",
      });
      res.json(
        enrichRemoteWithClawql(remote, {
          useSiteId: parsed.request.useSiteId ?? "search_provider_tool_routing",
          backendId: "openai/gpt-6-luna",
          calibrated: false,
          escalated: true,
          traceId: result.traceId,
        })
      );
      return;
    }

    res.json(
      toOpenAiDecisionResponse({
        clawql: result,
        questions: parsed.request.questions,
        model: parsed.model,
      })
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    sendOpenAiError(res, 502, message, "server_error");
  }
}

export function createDecisionRouter(options: CreateDecisionRouterOptions = {}): express.Router {
  const router = express.Router();
  const env = options.env ?? process.env;
  const decide = options.decide ?? runDecision;

  const systemOneHandler = (req: Request, res: Response) =>
    void handleDecide(req as VirtualKeyRequest, res, decide);

  router.post("/decision", systemOneHandler);
  router.post("/v1/systemone", systemOneHandler);

  router.post(
    "/v1/decisions",
    (req: Request, res: Response) =>
      void handleOpenAiDecisions(req as VirtualKeyRequest, res, {
        decide,
        callRemote: options.callRemote,
        env,
      })
  );

  router.get("/decision", (_req, res) => {
    res.json({
      object: "clawql.decision",
      methods: ["POST"],
      alias: "/v1/systemone",
      openai_compatible: "/v1/decisions",
      question_types: ["choice", "noul", "predicate", "score"],
      description:
        "System One choice|noul|score over Fast Decision. OpenAI Decisions clients should use POST /v1/decisions.",
    });
  });

  router.get("/v1/decisions", (_req, res) => {
    res.json({
      object: "decision",
      methods: ["POST"],
      models: ["clawql", "gliner2", "gpt-6-luna"],
      question_types: ["predicate", "choice", "score"],
      description:
        "OpenAI Decisions API-compatible endpoint. Local Fast Decision by default; gpt-6-luna when OPENAI_API_KEY is set. ClawQL adds calibrated, escalated, use_site_id, backend_id, trace_id.",
    });
  });

  return router;
}
