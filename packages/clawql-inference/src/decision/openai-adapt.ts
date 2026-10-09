/**
 * Map OpenAI Decisions API ↔ ClawQL DecisionRequest / DecisionResponse.
 */

import type {
  DecisionAnswer,
  DecisionQuestion,
  DecisionRequest,
  DecisionResponse,
  DecisionScoreLevel,
} from "./service.js";
import type {
  OpenAiDecisionAnswer,
  OpenAiDecisionCreateResponse,
  OpenAiDecisionInput,
  OpenAiDecisionQuestion,
} from "./openai-types.js";

export type ParsedOpenAiDecision = {
  readonly request: DecisionRequest;
  readonly model: string;
  readonly hasImages: boolean;
  readonly imageCount: number;
  readonly textEmpty: boolean;
};

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

export function extractTextAndImages(input: OpenAiDecisionInput): {
  text: string;
  hasImages: boolean;
  imageCount: number;
} {
  if (typeof input === "string") {
    return { text: input.trim(), hasImages: false, imageCount: 0 };
  }
  if (!Array.isArray(input)) {
    return { text: "", hasImages: false, imageCount: 0 };
  }
  const texts: string[] = [];
  let imageCount = 0;
  for (const msg of input) {
    if (!msg || typeof msg !== "object") continue;
    const m = msg as Record<string, unknown>;
    if (typeof m.content === "string") {
      const t = m.content.trim();
      if (t) texts.push(t);
      continue;
    }
    if (!Array.isArray(m.content)) continue;
    for (const part of m.content) {
      if (!part || typeof part !== "object") continue;
      const p = part as Record<string, unknown>;
      if (p.type === "input_text" && typeof p.text === "string") {
        const t = p.text.trim();
        if (t) texts.push(t);
      } else if (
        p.type === "input_image" &&
        typeof p.image_url === "string" &&
        p.image_url.trim()
      ) {
        imageCount += 1;
      }
    }
  }
  return {
    text: texts.join("\n").trim(),
    hasImages: imageCount > 0,
    imageCount,
  };
}

function mapOpenAiQuestion(q: OpenAiDecisionQuestion): DecisionQuestion | { error: string } {
  const name = typeof q.name === "string" ? q.name.trim() : "";
  if (!name) return { error: "each question requires a name" };

  if (q.type === "predicate") {
    const instructions = typeof q.instructions === "string" ? q.instructions.trim() : "";
    if (!instructions) return { error: "predicate questions require instructions" };
    return { type: "noul", name, statement: instructions };
  }

  if (q.type === "choice") {
    if (!Array.isArray(q.choices) || q.choices.length === 0) {
      return { error: "choice questions require a non-empty choices array" };
    }
    const options = q.choices.map((c) => {
      const value = typeof c.value === "string" ? c.value.trim() : "";
      if (!value) return null;
      return {
        id: value,
        description: typeof c.description === "string" ? c.description : undefined,
      };
    });
    if (options.some((o) => o === null)) {
      return { error: "choice choices require a value" };
    }
    return {
      type: "choice",
      name,
      instructions: typeof q.instructions === "string" ? q.instructions : undefined,
      options: options as Array<{ id: string; description?: string }>,
    };
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
      const label = typeof level.label === "string" ? level.label.trim() : "";
      if (!label) return { error: "score levels require a label" };
      levels.push({
        label,
        description: typeof level.description === "string" ? level.description : undefined,
      });
    }
    return {
      type: "score",
      name,
      instructions: typeof q.instructions === "string" ? q.instructions : undefined,
      levels,
    };
  }

  return {
    error: `unsupported question type '${String((q as { type?: unknown }).type)}'; use predicate|choice|score`,
  };
}

export function parseOpenAiDecisionBody(
  body: unknown,
  vk?: { id: string; team: string }
): ParsedOpenAiDecision | { error: string } {
  if (!body || typeof body !== "object") return { error: "JSON body required" };
  const b = body as Record<string, unknown>;
  const model = typeof b.model === "string" ? b.model.trim() : "";
  if (!model) return { error: "model is required" };
  if (b.input === undefined || b.input === null) return { error: "input is required" };

  const { text, hasImages, imageCount } = extractTextAndImages(b.input as OpenAiDecisionInput);
  if (!text && !hasImages) return { error: "input must include text and/or images" };

  if (!Array.isArray(b.questions) || b.questions.length === 0) {
    return { error: "questions must be a non-empty array" };
  }

  const questions: DecisionQuestion[] = [];
  for (const raw of b.questions) {
    if (!raw || typeof raw !== "object") {
      return { error: "questions must be predicate|choice|score items" };
    }
    const mapped = mapOpenAiQuestion(raw as OpenAiDecisionQuestion);
    if ("error" in mapped) return { error: mapped.error };
    questions.push(mapped);
  }

  const escalationRaw = asRecord(b.escalation);
  const escalationMode = escalationRaw.mode;
  if (
    escalationMode !== undefined &&
    escalationMode !== "abstain" &&
    escalationMode !== "escalate"
  ) {
    return { error: "escalation.mode must be abstain|escalate" };
  }

  const useSiteId =
    (typeof b.use_site_id === "string" && b.use_site_id.trim()) ||
    (typeof b.useSiteId === "string" && b.useSiteId.trim()) ||
    undefined;

  // Prefer text; when images-only, leave a short marker so local scorers still run
  // (vision backends replace this path). Refusal is decided at the router when needed.
  const state = text || `[image-only decision: ${imageCount} image(s)]`;

  return {
    model,
    hasImages,
    imageCount,
    textEmpty: !text,
    request: {
      state,
      questions,
      useSiteId,
      escalation:
        escalationMode || typeof escalationRaw.model === "string"
          ? {
              mode: escalationMode as "abstain" | "escalate" | undefined,
              model: typeof escalationRaw.model === "string" ? escalationRaw.model : undefined,
            }
          : undefined,
      sessionId: typeof b.session_id === "string" ? b.session_id : undefined,
      agentId: typeof b.agent_id === "string" ? b.agent_id : undefined,
      virtualKeyId: vk?.id,
      team: vk?.team,
    },
  };
}

function confidenceFromOptions(
  options: Array<{ id: string; probability: number }> | undefined,
  selectedId: string | undefined
): number {
  if (!options?.length) return 0;
  if (selectedId) {
    const hit = options.find((o) => o.id === selectedId);
    if (hit) return hit.probability;
  }
  return Math.max(...options.map((o) => o.probability), 0);
}

function toOpenAiProbabilities(
  options: Array<{ id: string; probability: number }> | undefined
): Array<{ value: string; probability: number }> {
  return (options ?? []).map((o) => ({ value: o.id, probability: o.probability }));
}

export function mapClawqlAnswerToOpenAi(
  answer: DecisionAnswer,
  question: DecisionQuestion
): OpenAiDecisionAnswer {
  if (answer.abstained && answer.escalated === false && answer.answer === undefined) {
    // Soft abstain without escalation → OpenAI refusal (application sets thresholds)
    // Keep calibrated backends' probability answers when not abstained.
  }

  if (question.type === "noul" || answer.type === "noul") {
    return {
      type: "predicate",
      name: answer.name,
      probability: answer.probability ?? 0,
    };
  }

  if (question.type === "score" || answer.type === "score") {
    const levels = question.type === "score" ? question.levels : [];
    const probs = toOpenAiProbabilities(answer.options);
    // Remap option ids (labels) to keep OpenAI value = label
    const byLabel = probs.length
      ? probs
      : levels.map((l, i) => ({
          value: l.label,
          probability: answer.options?.[i]?.probability ?? 0,
        }));
    let score = answer.score;
    if (score === undefined && answer.options?.length) {
      score = answer.options.reduce((acc, o, i) => {
        const idx = levels.findIndex((l) => l.label === o.id);
        const levelIndex = idx >= 0 ? idx : i;
        return acc + levelIndex * o.probability;
      }, 0);
    }
    return {
      type: "score",
      name: answer.name,
      score: score ?? 0,
      confidence: answer.selectedConfidence ?? confidenceFromOptions(answer.options, answer.answer),
      probabilities: byLabel,
    };
  }

  return {
    type: "choice",
    name: answer.name,
    choice: answer.answer ?? answer.options?.[0]?.id ?? "",
    confidence: answer.selectedConfidence ?? confidenceFromOptions(answer.options, answer.answer),
    probabilities: toOpenAiProbabilities(answer.options),
  };
}

export function toOpenAiDecisionResponse(opts: {
  clawql: DecisionResponse;
  questions: readonly DecisionQuestion[];
  model: string;
  refusals?: readonly { name: string; refusal: string }[];
}): OpenAiDecisionCreateResponse {
  const answers: OpenAiDecisionAnswer[] = [];
  const refusalByName = new Map((opts.refusals ?? []).map((r) => [r.name, r.refusal]));

  for (let i = 0; i < opts.questions.length; i++) {
    const q = opts.questions[i]!;
    const refusal = refusalByName.get(q.name);
    if (refusal) {
      answers.push({ type: "refusal", name: q.name, refusal });
      continue;
    }
    const a = opts.clawql.answers[i];
    if (!a) {
      answers.push({
        type: "refusal",
        name: q.name,
        refusal: "No answer produced for this question",
      });
      continue;
    }
    answers.push(mapClawqlAnswerToOpenAi(a, q));
  }

  return {
    id: `decision_${opts.clawql.traceId}`,
    object: "decision",
    model: opts.model,
    created: Math.floor(Date.now() / 1000),
    answers,
    calibrated: opts.clawql.calibrated,
    escalated: opts.clawql.escalated,
    use_site_id: opts.clawql.answers[0]?.useSiteId ?? "search_provider_tool_routing",
    backend_id: opts.clawql.backendId,
    trace_id: opts.clawql.traceId,
    clawql: {
      object: "clawql.decision",
      escalation_model: opts.clawql.escalationModel,
    },
  };
}

export function isLunaModelId(model: string): boolean {
  const m = model.trim().toLowerCase();
  return (
    m === "gpt-6-luna" ||
    m === "openai/gpt-6-luna" ||
    m.endsWith("/gpt-6-luna") ||
    m.includes("gpt-6-luna")
  );
}

export function isMicrosoftDecision1ModelId(model: string): boolean {
  const m = model.trim().toLowerCase();
  return (
    m === "microsoft-decision-1" ||
    m === "microsoft/microsoft-decision-1" ||
    m.includes("microsoft-decision-1")
  );
}
