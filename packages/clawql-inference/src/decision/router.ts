/**
 * Express router for:
 * - POST /decision and POST /v1/systemone (System One / ClawQL wire)
 * - POST /v1/decisions (OpenAI Decisions API compatible)
 */

import { randomUUID } from "node:crypto";
import express, { type Request, type Response } from "express";
import { Effect } from "effect";
import type { VirtualKeyRequest } from "../api/auth.js";
import { sendOpenAiError } from "../api/openai-errors.js";
import {
  isLunaModelId,
  parseOpenAiDecisionBody,
  toOpenAiDecisionResponse,
} from "./openai-adapt.js";
import type { OpenAiDecisionCreateRequest, OpenAiDecisionCreateResponse } from "./openai-types.js";
import { DecisionsPolicyLive, DecisionsPolicyService, type RefusalAnswer } from "./policy.js";
import {
  callRemoteOpenAiDecisions,
  enrichRemoteWithClawql,
  remoteLunaAvailable,
} from "./remote-decisions.js";
import {
  parseFanoutEvalBody,
  runFanoutEval,
  type FanoutEvalRequest,
  type FanoutEvalResponse,
} from "./fanout-eval.js";
import {
  parseFlipRateBody,
  runFlipRate,
  type FlipRateRequest,
  type FlipRateResponse,
} from "./flip-rate.js";
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
  /** Override fan-out eval (tests). */
  evaluate?: (req: FanoutEvalRequest) => Promise<FanoutEvalResponse>;
  /** Override flip-rate gate (tests). */
  flipRate?: (req: FlipRateRequest) => Promise<FlipRateResponse>;
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

function withPolicy<A>(effect: Effect.Effect<A, never, DecisionsPolicyService>): A {
  return Effect.runSync(effect.pipe(Effect.provide(DecisionsPolicyLive)));
}

function refusalResponse(opts: {
  questions: readonly DecisionQuestion[];
  model: string;
  refusals: readonly RefusalAnswer[];
  backendId?: string;
  useSiteId?: string;
}): OpenAiDecisionCreateResponse {
  return toOpenAiDecisionResponse({
    clawql: {
      object: "clawql.decision",
      answers: [],
      traceId: randomUUID(),
      escalated: false,
      calibrated: false,
      backendId: opts.backendId ?? "none",
    },
    questions: opts.questions,
    model: opts.model,
    refusals: opts.refusals,
  });
}

function applyRemoteFailClosed(
  remote: OpenAiDecisionCreateResponse,
  opts: {
    questions: readonly DecisionQuestion[];
    allowUncalibrated: boolean;
    model: string;
    useSiteId: string;
    backendId: string;
    escalated: boolean;
    traceId: string;
  }
): OpenAiDecisionCreateResponse {
  const enriched = enrichRemoteWithClawql(remote, {
    useSiteId: opts.useSiteId,
    backendId: opts.backendId,
    calibrated: false,
    escalated: opts.escalated,
    traceId: opts.traceId,
  });

  const refusals = withPolicy(
    Effect.gen(function* () {
      const policy = yield* DecisionsPolicyService;
      return yield* policy.refusalsForUncalibratedRemote({
        questionNames: opts.questions.map((q) => q.name),
        allowUncalibrated: opts.allowUncalibrated,
        backendLabel: "gpt-6-luna",
      });
    })
  );

  if (refusals.length === 0) {
    return { ...enriched, model: opts.model };
  }

  return toOpenAiDecisionResponse({
    clawql: {
      object: "clawql.decision",
      answers: [],
      traceId: opts.traceId,
      escalated: opts.escalated,
      calibrated: false,
      backendId: opts.backendId,
    },
    questions: opts.questions,
    model: opts.model,
    refusals,
  });
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

  const body = (req.body ?? {}) as Record<string, unknown>;
  const openAiBody = req.body as OpenAiDecisionCreateRequest;

  const { modelKind, allowUncalibrated, allowImages, modelError } = withPolicy(
    Effect.gen(function* () {
      const policy = yield* DecisionsPolicyService;
      const modelKind = yield* policy.classifyModel(parsed.model);
      const allowUncalibrated = yield* policy.allowUncalibrated({
        req,
        body,
        env: options.env,
      });
      const allowImages = yield* policy.allowExternalImages({
        req,
        body,
        env: options.env,
        useSiteId: parsed.request.useSiteId,
      });
      const modelError =
        modelKind === "local" || modelKind === "luna"
          ? undefined
          : yield* policy.modelRejectionMessage(parsed.model, modelKind);
      return { modelKind, allowUncalibrated, allowImages, modelError };
    })
  );

  if (modelError) {
    sendOpenAiError(res, 400, modelError, "invalid_request_error");
    return;
  }

  const preferRemote = modelKind === "luna" || isLunaModelId(parsed.model);
  const lunaOk = remoteLunaAvailable(options.env);
  const isAuto = parsed.model.trim().toLowerCase() === "clawql-auto";

  // Images: never treat API key presence as consent.
  if (parsed.hasImages && !allowImages) {
    res.json(
      refusalResponse({
        questions: parsed.request.questions,
        model: parsed.model,
        refusals: parsed.request.questions.map((q) => ({
          name: q.name,
          refusal:
            "Image inputs require explicit egress consent (x-clawql-allow-external-images: 1, allow_external_images: true, or CLAWQL_DECISIONS_ALLOW_EXTERNAL_IMAGES=1). Having OPENAI_API_KEY configured is not consent.",
        })),
      })
    );
    return;
  }

  if (parsed.hasImages && allowImages && !lunaOk && !preferRemote) {
    res.json(
      refusalResponse({
        questions: parsed.request.questions,
        model: parsed.model,
        refusals: parsed.request.questions.map((q) => ({
          name: q.name,
          refusal:
            "Image inputs require a vision-capable decisions backend (set OPENAI_API_KEY and model=gpt-6-luna)",
        })),
      })
    );
    return;
  }

  if (parsed.hasImages && allowImages && !lunaOk && preferRemote) {
    sendOpenAiError(
      res,
      503,
      "model gpt-6-luna requires OPENAI_API_KEY (or CLAWQL_DECISIONS_OPENAI_API_KEY)",
      "server_error"
    );
    return;
  }

  // clawql-auto: local-first with escalate when abstaining
  const decisionRequest: DecisionRequest = isAuto
    ? {
        ...parsed.request,
        escalation: {
          mode: parsed.request.escalation?.mode ?? "escalate",
          model: parsed.request.escalation?.model ?? "gpt-6-luna",
        },
      }
    : parsed.request;

  try {
    if ((preferRemote || (parsed.hasImages && allowImages)) && lunaOk) {
      const callRemote =
        options.callRemote ?? ((b) => callRemoteOpenAiDecisions(b, { env: options.env }));
      const remote = await callRemote({
        ...openAiBody,
        model: "gpt-6-luna",
      });
      res.json(
        applyRemoteFailClosed(remote, {
          questions: parsed.request.questions,
          allowUncalibrated,
          model: parsed.model,
          useSiteId: parsed.request.useSiteId ?? "search_provider_tool_routing",
          backendId: "openai/gpt-6-luna",
          escalated: false,
          traceId: randomUUID(),
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

    const result = await options.decide(decisionRequest);

    if (
      result.escalated &&
      lunaOk &&
      (decisionRequest.escalation?.mode === "escalate" ||
        decisionRequest.escalation?.model ||
        isAuto)
    ) {
      const callRemote =
        options.callRemote ?? ((b) => callRemoteOpenAiDecisions(b, { env: options.env }));
      const remote = await callRemote({
        ...openAiBody,
        model: "gpt-6-luna",
      });
      res.json(
        applyRemoteFailClosed(remote, {
          questions: parsed.request.questions,
          allowUncalibrated,
          model: parsed.model,
          useSiteId: parsed.request.useSiteId ?? "search_provider_tool_routing",
          backendId: "openai/gpt-6-luna",
          escalated: true,
          traceId: result.traceId,
        })
      );
      return;
    }

    const refusals = withPolicy(
      Effect.gen(function* () {
        const policy = yield* DecisionsPolicyService;
        return yield* policy.refusalsForFailClosed({
          questions: parsed.request.questions,
          answers: result.answers,
          allowUncalibrated,
        });
      })
    );

    res.json(
      toOpenAiDecisionResponse({
        clawql: result,
        questions: parsed.request.questions,
        model: parsed.model,
        refusals,
      })
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    sendOpenAiError(res, 502, message, "server_error");
  }
}

async function handleFanoutEval(
  req: VirtualKeyRequest,
  res: Response,
  options: {
    evaluate: (r: FanoutEvalRequest) => Promise<FanoutEvalResponse>;
  }
): Promise<void> {
  const parsed = parseFanoutEvalBody(req.body);
  if ("error" in parsed) {
    sendOpenAiError(res, 400, parsed.error, "invalid_request_error");
    return;
  }
  try {
    const result = await options.evaluate(parsed);
    res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    sendOpenAiError(res, 502, message, "server_error");
  }
}

async function handleFlipRate(
  req: VirtualKeyRequest,
  res: Response,
  options: {
    flipRate: (r: FlipRateRequest) => Promise<FlipRateResponse>;
  }
): Promise<void> {
  const parsed = parseFlipRateBody(req.body);
  if ("error" in parsed) {
    sendOpenAiError(res, 400, parsed.error, "invalid_request_error");
    return;
  }
  try {
    const result = await options.flipRate(parsed);
    res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    sendOpenAiError(res, 502, message, "server_error");
  }
}

export function createDecisionRouter(options: CreateDecisionRouterOptions = {}): express.Router {
  const router = express.Router();
  const env = options.env ?? process.env;
  const decide = options.decide ?? runDecision;
  const evaluate =
    options.evaluate ??
    ((req: FanoutEvalRequest) =>
      runFanoutEval(req, { decide, callRemote: options.callRemote, env }));
  const flipRate = options.flipRate ?? ((req: FlipRateRequest) => runFlipRate(req, { decide }));

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

  const evalHandler = (req: Request, res: Response) =>
    void handleFanoutEval(req as VirtualKeyRequest, res, { evaluate });
  router.post("/decision/eval", evalHandler);
  router.post("/v1/decisions/eval", evalHandler);

  const flipHandler = (req: Request, res: Response) =>
    void handleFlipRate(req as VirtualKeyRequest, res, { flipRate });
  router.post("/decision/flip-rate", flipHandler);
  router.post("/v1/decisions/flip-rate", flipHandler);

  router.get("/decision", (_req, res) => {
    res.json({
      object: "clawql.decision",
      methods: ["POST"],
      alias: "/v1/systemone",
      openai_compatible: "/v1/decisions",
      fanout_eval: "/decision/eval",
      flip_rate: "/decision/flip-rate",
      question_types: ["choice", "noul", "predicate", "score"],
      description:
        "System One choice|noul|score over Fast Decision. OpenAI Decisions: POST /v1/decisions. Fan-out eval: POST /decision/eval. Flip-rate gate: POST /decision/flip-rate.",
    });
  });

  router.get("/v1/decisions", (_req, res) => {
    res.json({
      object: "decision",
      methods: ["POST"],
      models: ["clawql-auto", "clawql", "gliner2", "gpt-6-luna"],
      question_types: ["predicate", "choice", "score"],
      fail_closed:
        "Uncalibrated answers (including all score answers) return type=refusal unless x-clawql-allow-uncalibrated: 1",
      image_egress:
        "Images require x-clawql-allow-external-images (OPENAI_API_KEY alone is not consent)",
      fanout_eval: "/v1/decisions/eval",
      description:
        "OpenAI Decisions API-compatible endpoint. clawql-auto = local-first + escalate; gpt-6-luna when keyed + allowed. ClawQL adds calibrated, escalated, use_site_id, backend_id, trace_id.",
    });
  });

  return router;
}
