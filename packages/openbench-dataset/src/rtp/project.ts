import type { OpenAIMessage, OpenBenchToolCall, OpenBenchVerdict } from "../schema/types.js";
import { issueOpenBenchConsentToken } from "./consent.js";
import { sealTurn, sha256Canonical } from "./hash.js";
import type {
  RtpEvaluatorTier,
  RtpSession,
  RtpTurnNode,
  RtpVerdictPayload,
} from "./types.js";
import { RTP_PROTOCOL, RTP_PROTOCOL_VERSION } from "./types.js";

const RETRIEVAL_TOOLS = new Set([
  "memory_recall",
  "clawql_memory_recall",
  "search",
  "clawql_search",
  "knowledge_search_onyx",
  "clawql_knowledge_search_onyx",
  "pageindex_traverse",
  "pageindex_get_content",
  "pageindex_synthesize",
  "clawql_pageindex_traverse",
  "clawql_pageindex_get_content",
  "clawql_pageindex_synthesize",
  "ingest_external_knowledge",
  "clawql_ingest_external_knowledge",
]);

/** Tasks whose OpenBench checkers are deterministic shell/policy checks → tier 1. */
const TIER1_TASK_HINTS = [
  "policy-deny",
  "audit-checkpoints",
  "cache-scratch",
  "schedule-synthetic",
  "notify-mock",
  "sandbox-trusted",
];

export function resolveEvaluatorTier(taskId: string, graderId: string): RtpEvaluatorTier {
  const hay = `${taskId} ${graderId}`.toLowerCase();
  if (hay.includes("semantic") || hay.includes("llm-judge") || hay.includes("tier-2")) {
    return 2;
  }
  if (hay.includes("human") || hay.includes("tier-3")) {
    return 3;
  }
  if (TIER1_TASK_HINTS.some((h) => hay.includes(h))) {
    return 1;
  }
  // Default OpenBench checker.sh is deterministic evidence grading.
  if (graderId.includes("checker.sh") || graderId.startsWith("openbench/")) {
    return 1;
  }
  return 2;
}

function isRetrievalTool(name: string): boolean {
  const n = name.toLowerCase().replace(/^tool:/, "");
  if (RETRIEVAL_TOOLS.has(n)) return true;
  return (
    n.includes("memory_recall") ||
    n.includes("search") ||
    n.includes("pageindex") ||
    n.includes("onyx") ||
    n.includes("knowledge")
  );
}

function firstUserPrompt(messages: OpenAIMessage[]): string {
  for (const m of messages) {
    if (m.role === "user" && m.content != null) {
      return typeof m.content === "string" ? m.content : JSON.stringify(m.content);
    }
  }
  return "";
}

function parseGoal(raw: string, taskId: string): string {
  const line = raw
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.length > 0 && !l.startsWith("#"));
  if (line && line.length <= 240) return line;
  if (line) return `${line.slice(0, 237)}...`;
  return `complete openbench task ${taskId}`;
}

function queryFromToolInput(input: unknown): string[] {
  if (input == null) return [];
  if (typeof input === "string") return [input];
  if (typeof input === "object") {
    const obj = input as Record<string, unknown>;
    for (const key of ["query", "q", "prompt", "text", "title"]) {
      if (typeof obj[key] === "string" && obj[key]) return [obj[key] as string];
    }
    return [JSON.stringify(input).slice(0, 500)];
  }
  return [String(input)];
}

export type ProjectToRtpInput = {
  runId: string;
  taskId: string;
  messages: OpenAIMessage[];
  toolCalls: OpenBenchToolCall[];
  verdict: OpenBenchVerdict;
  score: number;
  graderId: string;
  collectedAt?: string;
  consentToken?: string;
  env?: NodeJS.ProcessEnv;
};

/**
 * Project OpenBench messages + tool_calls into an RTP session (six-node sequence).
 */
export function projectToRtpSession(input: ProjectToRtpInput): RtpSession {
  const collectedAt = input.collectedAt ?? new Date().toISOString();
  const consent = issueOpenBenchConsentToken({
    runId: input.runId,
    taskId: input.taskId,
    issuedAt: collectedAt,
    preissuedToken: input.consentToken,
    env: input.env,
  });

  const rawPrompt = firstUserPrompt(input.messages);
  const turns: RtpTurnNode[] = [];
  let prev: string | null = null;
  let turnIndex = 0;
  let stateHash = sha256Canonical({ messages: [], tools: [] });

  const intent = sealTurn(
    {
      kind: "intent",
      turnIndex: turnIndex++,
      intent: {
        rawPrompt: rawPrompt || `(task:${input.taskId})`,
        parsedGoal: parseGoal(rawPrompt, input.taskId),
      },
    },
    prev
  );
  turns.push(intent);
  prev = intent.turnHash;
  stateHash = sha256Canonical({ after: "intent", prompt: intent.intent?.rawPrompt });

  const assistantBits = input.messages
    .filter((m) => m.role === "assistant")
    .map((m) => (typeof m.content === "string" ? m.content : JSON.stringify(m.content ?? "")))
    .filter(Boolean);

  for (const call of input.toolCalls) {
    const toolName = String(call.tool || "unknown");
    if (isRetrievalTool(toolName)) {
      const retrieval = sealTurn(
        {
          kind: "retrieval",
          turnIndex: turnIndex++,
          retrieval: {
            queries: queryFromToolInput(call.input),
            sources: [toolName],
            tool: toolName,
          },
        },
        prev
      );
      turns.push(retrieval);
      prev = retrieval.turnHash;
    } else {
      const seed =
        assistantBits.length > 0
          ? assistantBits.slice(-2).map((s) => s.slice(0, 800))
          : [`select tool ${toolName}`];
      const reasoning = sealTurn(
        {
          kind: "reasoning",
          turnIndex: turnIndex++,
          reasoning: {
            seedChain: seed,
            selectedTool: toolName,
          },
        },
        prev
      );
      turns.push(reasoning);
      prev = reasoning.turnHash;
    }

    const before = stateHash;
    const execution = sealTurn(
      {
        kind: "execution",
        turnIndex: turnIndex++,
        execution: {
          toolName,
          payload: call.input,
          output: call.output,
        },
      },
      prev
    );
    turns.push(execution);
    prev = execution.turnHash;

    stateHash = sha256Canonical({
      before,
      tool: toolName,
      input: call.input ?? null,
      output: call.output ?? null,
    });
    const delta = sealTurn(
      {
        kind: "delta",
        turnIndex: turnIndex++,
        delta: {
          stateBeforeHash: before,
          stateAfterHash: stateHash,
        },
      },
      prev
    );
    turns.push(delta);
    prev = delta.turnHash;
  }

  // If no tools, still emit a minimal reasoning node from assistant text.
  if (input.toolCalls.length === 0 && assistantBits.length > 0) {
    const reasoning = sealTurn(
      {
        kind: "reasoning",
        turnIndex: turnIndex++,
        reasoning: {
          seedChain: assistantBits.slice(0, 3).map((s) => s.slice(0, 800)),
        },
      },
      prev
    );
    turns.push(reasoning);
    prev = reasoning.turnHash;
  }

  const verdictPayload: RtpVerdictPayload = {
    outcome: input.verdict,
    evaluatorTier: resolveEvaluatorTier(input.taskId, input.graderId),
    source: "grader",
    graderId: input.graderId,
    score: input.score,
  };
  const verdictNode = sealTurn(
    {
      kind: "verdict",
      turnIndex: turnIndex++,
      verdict: verdictPayload,
    },
    prev
  );
  turns.push(verdictNode);

  return {
    protocol: RTP_PROTOCOL,
    protocolVersion: RTP_PROTOCOL_VERSION,
    consentToken: {
      token: consent.token,
      scopes: consent.scopes,
      issuedAt: consent.issuedAt,
      issuer: consent.issuer,
      subject: consent.subject,
    },
    turnSequence: turns,
    verdict: verdictPayload,
  };
}

/** Extract a standalone RTP session record from an OpenBenchTrace (for HF / FT pipelines). */
export function extractRtpSession(trace: { rtp: RtpSession }): RtpSession {
  return trace.rtp;
}
