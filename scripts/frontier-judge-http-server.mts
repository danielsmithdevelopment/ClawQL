#!/usr/bin/env npx tsx
/**
 * HTTP frontier-judge sidecar for §7.2 held-out adjudication.
 *
 * Implements the CLAWQL_FAST_DECISION_JUDGE_URL contract:
 *   POST /v1/fast-decision/adjudicate
 *   Body: { caseId, useSiteId, query, candidates, model? }
 *   Response: {
 *     groundTruthCandidateId, rationale, backend?,
 *     rawGroundTruthCandidateId?, candidateIdRemap?
 *   }
 *
 * CandidateId policy (bounded):
 *   - Cosmetic normalize only (quote strip / case fold to allowlisted id).
 *   - Every cosmetic remap is returned + logged (before → after).
 *   - Semantic remaps (label → id, suffix) **fail the case** — never counted.
 *   - One correction retry if the first answer is not allowlisted.
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
import { resolveJudgeCandidateId } from "clawql-core";

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

type CosmeticRemap = {
  before: string;
  after: string;
  kind: "cosmetic";
};

type JudgeOut = {
  groundTruthCandidateId: string;
  rationale: string;
  backend: string;
  rawGroundTruthCandidateId: string;
  candidateIdRemap: CosmeticRemap | null;
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

function envFlagTrue(name: string): boolean {
  const v = process.env[name]?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
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
  const ids = (req.candidates ?? [])
    .map((c) => c.candidateId)
    .filter((x): x is string => Boolean(x));
  return [
    "You are the §7.2 frontier judge for ClawQL Fast Decision held-out cases.",
    "Pick exactly one ground-truth candidateId from the list. Respond with JSON only:",
    '{"groundTruthCandidateId":"<id>","rationale":"<one sentence>"}',
    "The groundTruthCandidateId value MUST be copied exactly from this allowlist (character-for-character):",
    ids.map((id) => `  - ${id}`).join("\n"),
    "Do not invent ids. Do not use labels, operationIds from the query, or paraphrases.",
    "",
    `useSiteId: ${req.useSiteId ?? ""}`,
    `caseId: ${req.caseId ?? ""}`,
    `query: ${req.query ?? ""}`,
    "candidates:",
    candidateLines(req.candidates ?? []),
  ].join("\n");
}

function buildCorrectionPrompt(req: JudgeRequest, badId: string): string {
  const ids = (req.candidates ?? [])
    .map((c) => c.candidateId)
    .filter((x): x is string => Boolean(x));
  return [
    "Your previous answer used an invalid candidateId.",
    `Invalid value: ${JSON.stringify(badId)}`,
    "Respond again with JSON only. groundTruthCandidateId MUST be exactly one of:",
    ids.map((id) => `  - ${id}`).join("\n"),
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

async function callBackend(
  prompt: string,
  model: string
): Promise<{ groundTruthCandidateId: string; rationale: string; backend: string }> {
  const preferOr =
    envFlagTrue("CLAWQL_FRONTIER_JUDGE_VIA_OPENROUTER") ||
    envFlagTrue("CLAWQL_LAB_USE_OPENROUTER");
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

function acceptOrThrow(
  caseId: string | undefined,
  raw: string,
  candidates: Candidate[],
  backend: string,
  rationale: string
): JudgeOut {
  const resolved = resolveJudgeCandidateId(raw, candidates);
  if (resolved.ok) {
    if (resolved.remap) {
      console.error(
        `[frontier-judge] caseId=${caseId ?? "?"} cosmetic remap ${JSON.stringify(resolved.remap.before)} → ${JSON.stringify(resolved.remap.after)}`
      );
    }
    return {
      groundTruthCandidateId: resolved.candidateId,
      rationale,
      backend,
      rawGroundTruthCandidateId: raw,
      candidateIdRemap: resolved.remap,
    };
  }
  if (resolved.reason === "semantic-remap-forbidden" && resolved.wouldRemap) {
    throw new Error(
      `semantic candidateId remap forbidden (caseId=${caseId ?? "?"}, before=${JSON.stringify(resolved.wouldRemap.before)}, after=${JSON.stringify(resolved.wouldRemap.after)}) — refuse rather than re-point the judge answer`
    );
  }
  throw new Error(
    `judge returned unknown candidateId ${JSON.stringify(raw)} (caseId=${caseId ?? "?"})`
  );
}

async function adjudicate(req: JudgeRequest): Promise<JudgeOut> {
  const model = (req.model?.trim() || DEFAULT_MODEL).replace(/^anthropic\//, "");
  const candidates = req.candidates ?? [];
  const first = await callBackend(buildPrompt(req), model);
  try {
    return acceptOrThrow(
      req.caseId,
      first.groundTruthCandidateId,
      candidates,
      first.backend,
      first.rationale
    );
  } catch (firstErr) {
    const firstMsg = firstErr instanceof Error ? firstErr.message : String(firstErr);
    // Semantic remap is a hard fail — do not retry into a silent re-point.
    if (firstMsg.includes("semantic candidateId remap forbidden")) {
      throw firstErr;
    }
    console.error(
      `[frontier-judge] caseId=${req.caseId ?? "?"} ${firstMsg} — retrying once with correction prompt`
    );
    const second = await callBackend(
      buildCorrectionPrompt(req, first.groundTruthCandidateId),
      model
    );
    try {
      const accepted = acceptOrThrow(
        req.caseId,
        second.groundTruthCandidateId,
        candidates,
        `${second.backend}+retry`,
        second.rationale || first.rationale
      );
      return accepted;
    } catch (secondErr) {
      const secondMsg = secondErr instanceof Error ? secondErr.message : String(secondErr);
      throw new Error(
        `${secondMsg} (first=${JSON.stringify(first.groundTruthCandidateId)})`
      );
    }
  }
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
      candidateIdRemapPolicy:
        "cosmetic-only (quote/case); semantic label/suffix remaps fail the case",
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
      const out = await adjudicate(body);
      json(res, 200, {
        groundTruthCandidateId: out.groundTruthCandidateId,
        rationale: out.rationale,
        backend: out.backend,
        rawGroundTruthCandidateId: out.rawGroundTruthCandidateId,
        candidateIdRemap: out.candidateIdRemap,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[frontier-judge] error: ${msg}`);
      const status =
        /unknown candidateId|semantic candidateId remap|openrouter HTTP|anthropic HTTP/.test(msg)
          ? 502
          : 500;
      json(res, status, { error: msg });
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
