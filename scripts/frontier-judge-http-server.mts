#!/usr/bin/env npx tsx
/**
 * HTTP frontier-judge sidecar for §7.2 held-out adjudication.
 *
 * Implements the CLAWQL_FAST_DECISION_JUDGE_URL contract:
 *   POST /v1/fast-decision/adjudicate
 *   Body: { caseId, useSiteId, query, candidates, model? }
 *   Response: { groundTruthCandidateId, rationale }
 *
 * Backends (first match):
 *   1. ANTHROPIC_API_KEY → Anthropic Messages API (default model claude-sonnet-4-6)
 *   2. OPENROUTER_API_KEY → OpenRouter chat completions
 *
 * Host boundary: thin HTTP façade over fetch. Fail closed if no key.
 *
 * Usage:
 *   npx tsx scripts/frontier-judge-http-server.mts
 *   CLAWQL_FAST_DECISION_JUDGE_URL=http://127.0.0.1:18765/v1/fast-decision/adjudicate \
 *     npx tsx scripts/run-held-out-adjudication.mts --out /tmp/labels.json
 */

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

const PORT = Number(process.env.CLAWQL_FRONTIER_JUDGE_PORT ?? "18765");
const HOST = process.env.CLAWQL_FRONTIER_JUDGE_HOST ?? "127.0.0.1";
const DEFAULT_MODEL =
  process.env.CLAWQL_FAST_DECISION_JUDGE_MODEL?.trim() || "claude-sonnet-4-6";

type Candidate = {
  candidateId?: string;
  features?: { label?: string; description?: string };
};

type JudgeRequest = {
  caseId?: string;
  useSiteId?: string;
  query?: string;
  candidates?: Candidate[];
  model?: string;
};

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function json(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(text),
  });
  res.end(text);
}

function candidateLines(cands: Candidate[]): string {
  return cands
    .map((c, i) => {
      const id = c.candidateId ?? `cand-${i}`;
      const label = c.features?.label ?? "";
      const desc = c.features?.description ?? "";
      return `- ${id}: ${label}${desc ? ` — ${desc}` : ""}`;
    })
    .join("\n");
}

function buildPrompt(req: JudgeRequest): string {
  return [
    "You are the §7.2 frontier judge for ClawQL Fast Decision held-out cases.",
    "Pick exactly one ground-truth candidateId from the list. Respond with JSON only:",
    '{"groundTruthCandidateId":"<id>","rationale":"<one sentence>"}',
    "",
    `useSiteId: ${req.useSiteId ?? ""}`,
    `caseId: ${req.caseId ?? ""}`,
    `query: ${req.query ?? ""}`,
    "candidates:",
    candidateLines(req.candidates ?? []),
  ].join("\n");
}

function parseJudgeJson(text: string): { groundTruthCandidateId: string; rationale: string } {
  const trimmed = text.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fence?.[1]?.trim() ?? trimmed;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end < 0) throw new Error("judge response not JSON object");
  const parsed = JSON.parse(raw.slice(start, end + 1)) as {
    groundTruthCandidateId?: string;
    rationale?: string;
  };
  if (!parsed.groundTruthCandidateId) {
    throw new Error("missing groundTruthCandidateId");
  }
  return {
    groundTruthCandidateId: parsed.groundTruthCandidateId,
    rationale: parsed.rationale ?? "",
  };
}

async function judgeViaAnthropic(
  prompt: string,
  model: string
): Promise<{ groundTruthCandidateId: string; rationale: string; backend: string }> {
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  if (!key) throw new Error("ANTHROPIC_API_KEY unset");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 512,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) {
    throw new Error(`anthropic HTTP ${res.status}: ${(await res.text()).slice(0, 400)}`);
  }
  const body = (await res.json()) as {
    content?: Array<{ type?: string; text?: string }>;
  };
  const text = (body.content ?? [])
    .filter((c) => c.type === "text" && typeof c.text === "string")
    .map((c) => c.text!)
    .join("\n");
  const parsed = parseJudgeJson(text);
  return { ...parsed, backend: `anthropic:${model}` };
}

async function judgeViaOpenRouter(
  prompt: string,
  model: string
): Promise<{ groundTruthCandidateId: string; rationale: string; backend: string }> {
  const key = process.env.OPENROUTER_API_KEY?.trim();
  if (!key) throw new Error("OPENROUTER_API_KEY unset");
  const orModel = model.includes("/") ? model : `anthropic/${model}`;
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${key}`,
      "http-referer": process.env.CLAWQL_OPENROUTER_HTTP_REFERER ?? "https://clawql.com",
      "x-title": process.env.CLAWQL_OPENROUTER_APP_TITLE ?? "ClawQL Fast Decision Judge",
    },
    body: JSON.stringify({
      model: orModel,
      max_tokens: 512,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) {
    throw new Error(`openrouter HTTP ${res.status}: ${(await res.text()).slice(0, 400)}`);
  }
  const body = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const text = body.choices?.[0]?.message?.content ?? "";
  const parsed = parseJudgeJson(text);
  return { ...parsed, backend: `openrouter:${orModel}` };
}

async function adjudicate(
  req: JudgeRequest
): Promise<{ groundTruthCandidateId: string; rationale: string; backend: string }> {
  const model = (req.model?.trim() || DEFAULT_MODEL).replace(/^anthropic\//, "");
  const prompt = buildPrompt(req);
  const preferOr =
    process.env.CLAWQL_FRONTIER_JUDGE_VIA_OPENROUTER?.trim() === "1" ||
    process.env.CLAWQL_LAB_USE_OPENROUTER?.trim() === "1";
  if (preferOr && process.env.OPENROUTER_API_KEY?.trim()) {
    return judgeViaOpenRouter(prompt, model.includes("/") ? model : `anthropic/${model}`);
  }
  if (process.env.ANTHROPIC_API_KEY?.trim()) {
    return judgeViaAnthropic(prompt, model);
  }
  if (process.env.OPENROUTER_API_KEY?.trim()) {
    return judgeViaOpenRouter(prompt, model.includes("/") ? model : `anthropic/${model}`);
  }
  throw new Error("No ANTHROPIC_API_KEY or OPENROUTER_API_KEY configured");
}

const server = createServer(async (req, res) => {
  const url = req.url?.split("?")[0] ?? "";
  if (req.method === "GET" && (url === "/healthz" || url === "/")) {
    json(res, 200, {
      ok: true,
      service: "clawql-frontier-judge",
      hasAnthropic: Boolean(process.env.ANTHROPIC_API_KEY?.trim()),
      hasOpenRouter: Boolean(process.env.OPENROUTER_API_KEY?.trim()),
      defaultModel: DEFAULT_MODEL,
    });
    return;
  }
  if (req.method === "POST" && url === "/v1/fast-decision/adjudicate") {
    try {
      const raw = await readBody(req);
      const body = JSON.parse(raw || "{}") as JudgeRequest;
      if (!body.query || !Array.isArray(body.candidates) || body.candidates.length === 0) {
        json(res, 400, { error: "query and candidates required" });
        return;
      }
      const ids = new Set(
        body.candidates.map((c) => c.candidateId).filter((x): x is string => Boolean(x))
      );
      const out = await adjudicate(body);
      if (!ids.has(out.groundTruthCandidateId)) {
        json(res, 502, {
          error: `judge returned unknown candidateId ${out.groundTruthCandidateId}`,
          backend: out.backend,
        });
        return;
      }
      json(res, 200, {
        groundTruthCandidateId: out.groundTruthCandidateId,
        rationale: out.rationale,
        backend: out.backend,
      });
    } catch (e) {
      json(res, 500, { error: e instanceof Error ? e.message : String(e) });
    }
    return;
  }
  json(res, 404, { error: "not found" });
});

server.listen(PORT, HOST, () => {
  console.error(
    `[frontier-judge] listening http://${HOST}:${PORT}/v1/fast-decision/adjudicate`
  );
});
