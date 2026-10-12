/**
 * OpenRouter Microsoft-Decision-1 client + /v1/decisions wiring.
 */

import { createServer, request, type Server } from "node:http";
import { once } from "node:events";
import { describe, expect, it } from "vitest";
import express from "express";
import { createDecisionRouter } from "./router.js";
import {
  callRemoteOpenRouterDecisions,
  openAiQuestionsToOpenRouterMap,
  openRouterAnswersToOpenAi,
  remoteOpenRouterDecisionsAvailable,
  resolveOpenRouterDecisionsModel,
} from "./remote-openrouter-decisions.js";
import { runFanoutEval } from "./fanout-eval.js";
import type { DecisionRequest, DecisionResponse } from "./service.js";

function closeHttpServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof server.closeIdleConnections === "function") {
      server.closeIdleConnections();
    }
    server.close((err) => (err ? reject(err) : resolve()));
  });
}

async function httpJson(
  url: string,
  init?: { method?: string; body?: string }
): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = {};
    if (init?.body) headers["Content-Type"] = "application/json";
    const req = request(
      url,
      { method: init?.method ?? "GET", headers: Object.keys(headers).length ? headers : undefined },
      (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => {
          resolve({
            status: res.statusCode ?? 0,
            body: data ? (JSON.parse(data) as unknown) : null,
          });
        });
      }
    );
    req.on("error", reject);
    if (init?.body) req.write(init.body);
    req.end();
  });
}

describe("OpenRouter Decision-1 helpers", () => {
  it("resolves model pins and availability", () => {
    expect(resolveOpenRouterDecisionsModel("microsoft-decision-1")).toBe(
      "microsoft/microsoft-decision-1"
    );
    expect(resolveOpenRouterDecisionsModel("microsoft/microsoft-decision-1")).toBe(
      "microsoft/microsoft-decision-1"
    );
    expect(remoteOpenRouterDecisionsAvailable({})).toBe(false);
    expect(remoteOpenRouterDecisionsAvailable({ OPENROUTER_API_KEY: "sk-or" })).toBe(true);
  });

  it("maps OpenAI questions to OpenRouter criteria shape", () => {
    const map = openAiQuestionsToOpenRouterMap([
      {
        type: "choice",
        name: "department",
        instructions: "Which team?",
        choices: [
          { value: "billing", description: "Payments" },
          { value: "shipping", description: "Delivery" },
        ],
      },
    ]);
    expect(map.department).toMatchObject({
      type: "choice",
      criteria: { billing: "Payments", shipping: "Delivery" },
    });
  });

  it("converts OpenRouter answer map to OpenAI Decisions response", () => {
    const converted = openRouterAnswersToOpenAi(
      {
        department: {
          type: "choice",
          choice: "billing",
          confidence: 0.8,
          probabilities: { billing: 0.8, shipping: 0.2 },
        },
      },
      "microsoft/microsoft-decision-1",
      "gen-1"
    );
    expect(converted.answers[0]).toMatchObject({
      type: "choice",
      name: "department",
      choice: "billing",
      confidence: 0.8,
    });
  });

  it("posts System One map to OpenRouter decisions endpoint", async () => {
    const fetchImpl = (async (input, init) => {
      expect(String(input)).toContain("/decisions");
      const body = JSON.parse(String(init?.body)) as {
        model: string;
        state: string;
        questions: Record<string, unknown>;
      };
      expect(body.model).toBe("microsoft/microsoft-decision-1");
      expect(body.questions.department).toBeDefined();
      return new Response(
        JSON.stringify({
          id: "gen-or-1",
          model: "microsoft/microsoft-decision-1-20261009",
          answers: {
            department: {
              type: "choice",
              choice: "billing",
              confidence: 0.9,
              probabilities: { billing: 0.9, shipping: 0.1 },
            },
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }) as unknown as typeof fetch;

    const result = await callRemoteOpenRouterDecisions(
      {
        model: "microsoft-decision-1",
        input: "I was charged twice.",
        questions: [
          {
            type: "choice",
            name: "department",
            choices: [
              { value: "billing", description: "Payments" },
              { value: "shipping", description: "Delivery" },
            ],
          },
        ],
      },
      { apiKey: "sk-or-test", fetchImpl }
    );
    expect(result.answers[0]).toMatchObject({ type: "choice", choice: "billing" });
  });
});

describe("OpenRouter Decision-1 HTTP + fan-out", () => {
  it("POST /v1/decisions routes microsoft-decision-1 via OpenRouter", async () => {
    const app = express();
    app.use(express.json());
    app.use(
      createDecisionRouter({
        env: { OPENROUTER_API_KEY: "sk-or" },
        callOpenRouter: async () => ({
          id: "decision_or",
          object: "decision",
          model: "microsoft/microsoft-decision-1",
          created: 1,
          answers: [
            {
              type: "choice",
              name: "department",
              choice: "billing",
              confidence: 0.88,
              probabilities: [{ value: "billing", probability: 0.88 }],
            },
          ],
          usage: {
            input_tokens: 1,
            output_tokens: 1,
            total_tokens: 2,
            input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
            output_tokens_details: { reasoning_tokens: 0 },
          },
          calibrated: false,
          escalated: false,
          use_site_id: "search_provider_tool_routing",
          backend_id: "openrouter/microsoft/microsoft-decision-1",
          trace_id: "t",
        }),
      })
    );
    const server = createServer(app);
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("expected port");

    try {
      const refused = await httpJson(`http://127.0.0.1:${address.port}/v1/decisions`, {
        method: "POST",
        body: JSON.stringify({
          model: "microsoft-decision-1",
          input: "I was charged twice for my order.",
          questions: [
            {
              type: "choice",
              name: "department",
              choices: [
                { value: "billing", description: "Payments" },
                { value: "shipping", description: "Delivery" },
              ],
            },
          ],
        }),
      });
      expect(refused.status).toBe(200);
      const body = refused.body as { answers: Array<{ type: string }> };
      // Fail-closed without allow_uncalibrated
      expect(body.answers[0]?.type).toBe("refusal");

      const ok = await httpJson(`http://127.0.0.1:${address.port}/v1/decisions`, {
        method: "POST",
        body: JSON.stringify({
          model: "microsoft-decision-1",
          input: "I was charged twice for my order.",
          allow_uncalibrated: true,
          questions: [
            {
              type: "choice",
              name: "department",
              choices: [
                { value: "billing", description: "Payments" },
                { value: "shipping", description: "Delivery" },
              ],
            },
          ],
        }),
      });
      expect(ok.status).toBe(200);
      const okBody = ok.body as {
        answers: Array<{ type: string; choice?: string }>;
        backend_id: string;
      };
      expect(okBody.answers[0]?.type).toBe("choice");
      expect(okBody.answers[0]?.choice).toBe("billing");
      expect(okBody.backend_id).toMatch(/openrouter/);
    } finally {
      await closeHttpServer(server);
    }
  });

  it("fan-out bulk includes Decision-1 backend when OpenRouter callable", async () => {
    const decideBilling = (_req: DecisionRequest): Promise<DecisionResponse> =>
      Promise.resolve({
        object: "clawql.decision",
        answers: [
          {
            name: "department",
            type: "choice",
            answer: "billing",
            abstained: false,
            escalated: false,
            calibrated: false,
            backendId: "stub",
            useSiteId: "search_provider_tool_routing",
          },
        ],
        traceId: "stub",
        escalated: false,
        calibrated: false,
        backendId: "stub",
      });

    const result = await runFanoutEval(
      {
        mode: "bulk",
        cases: [
          {
            caseId: "billing-1",
            state: "I was charged twice for my order.",
            questions: [
              {
                type: "choice",
                name: "department",
                options: [
                  { id: "billing", description: "Payments" },
                  { id: "shipping", description: "Delivery" },
                ],
              },
            ],
            expected: [{ name: "department", answer: "billing" }],
          },
        ],
        backends: [
          { id: "local", costPerCase: 0 },
          {
            id: "openrouter/microsoft/microsoft-decision-1",
            model: "microsoft/microsoft-decision-1",
            costPerCase: 0.001,
          },
        ],
      },
      {
        env: {},
        decide: decideBilling,
        callOpenRouter: async () => ({
          id: "or",
          object: "decision",
          model: "microsoft/microsoft-decision-1",
          created: 1,
          answers: [
            {
              type: "choice",
              name: "department",
              choice: "billing",
              confidence: 0.9,
              probabilities: [{ value: "billing", probability: 0.9 }],
            },
          ],
          usage: {
            input_tokens: 1,
            output_tokens: 1,
            total_tokens: 2,
            input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
            output_tokens_details: { reasoning_tokens: 0 },
          },
          calibrated: false,
          escalated: false,
          use_site_id: "search_provider_tool_routing",
          backend_id: "openrouter/microsoft/microsoft-decision-1",
          trace_id: "t",
        }),
      }
    );

    const d1 = result.reports.find(
      (r) => r.backendId === "openrouter/microsoft/microsoft-decision-1"
    );
    expect(d1?.meetsQualityBar).toBe(true);
    expect(d1?.correct).toBe(1);
    expect(result.recommendation?.backendId).toBe("local");
  });

  it("fan-out skips Decision-1 when OpenRouter unkeyed", async () => {
    const result = await runFanoutEval(
      {
        mode: "bulk",
        cases: [
          {
            caseId: "billing-1",
            state: "charged twice",
            questions: [
              {
                type: "choice",
                name: "department",
                options: [
                  { id: "billing", description: "Payments" },
                  { id: "shipping", description: "Delivery" },
                ],
              },
            ],
            expected: [{ name: "department", answer: "billing" }],
          },
        ],
        backends: [
          { id: "local", costPerCase: 0 },
          { id: "microsoft-decision-1", model: "microsoft-decision-1", costPerCase: 1 },
        ],
      },
      {
        env: {},
        decide: async () => ({
          object: "clawql.decision",
          answers: [
            {
              name: "department",
              type: "choice",
              answer: "billing",
              abstained: false,
              escalated: false,
              calibrated: false,
              backendId: "stub",
              useSiteId: "search_provider_tool_routing",
            },
          ],
          traceId: "stub",
          escalated: false,
          calibrated: false,
          backendId: "stub",
        }),
      }
    );
    const d1 = result.reports.find((r) => r.backendId === "microsoft-decision-1");
    expect(d1?.skipped).toBe(1);
    expect(d1?.skipReason).toMatch(/OPENROUTER_API_KEY/);
  });
});
