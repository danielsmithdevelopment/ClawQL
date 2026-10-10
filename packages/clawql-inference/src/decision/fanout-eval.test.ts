/**
 * Fan-out evaluation (bulk) — recommend cheapest backend meeting quality bar.
 */

import { createServer, request, type Server } from "node:http";
import { once } from "node:events";
import { describe, expect, it } from "vitest";
import express from "express";
import { createDecisionRouter } from "./router.js";
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
  init?: { method?: string; body?: string; headers?: Record<string, string> }
): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = { ...init?.headers };
    if (init?.body) headers["Content-Type"] = "application/json";
    const req = request(
      url,
      {
        method: init?.method ?? "GET",
        headers: Object.keys(headers).length ? headers : undefined,
      },
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

const billingCase = {
  caseId: "billing-1",
  state: "I was charged twice for my order.",
  questions: [
    {
      type: "choice" as const,
      name: "department",
      options: [
        { id: "billing", description: "Payments, invoices, and refunds." },
        { id: "shipping", description: "Delivery and tracking." },
      ],
    },
  ],
  expected: [{ name: "department", answer: "billing" }],
};

function decideBilling(_req: DecisionRequest): Promise<DecisionResponse> {
  return Promise.resolve({
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
}

describe("fan-out eval bulk", () => {
  it("recommends cheapest local backend that meets maxWrong=0", async () => {
    const result = await runFanoutEval(
      {
        mode: "bulk",
        cases: [billingCase],
        backends: [
          { id: "local-cheap", model: "clawql", costPerCase: 0 },
          { id: "openai/gpt-6-luna", model: "gpt-6-luna", costPerCase: 0.002 },
        ],
        qualityBar: { maxWrongAnswers: 0, minAnswered: 1 },
      },
      {
        env: {},
        decide: decideBilling,
        callRemote: async () => ({
          id: "decision_remote",
          object: "decision",
          model: "gpt-6-luna",
          created: 1,
          answers: [
            {
              type: "choice",
              name: "department",
              choice: "shipping",
              confidence: 0.9,
              probabilities: [{ value: "shipping", probability: 0.9 }],
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
          backend_id: "openai/gpt-6-luna",
          trace_id: "r",
        }),
      }
    );

    expect(result.object).toBe("clawql.decision.fanout_eval");
    expect(result.mode).toBe("bulk");
    expect(result.caseCount).toBe(1);
    const local = result.reports.find((r) => r.backendId === "local-cheap");
    const luna = result.reports.find((r) => r.backendId === "openai/gpt-6-luna");
    expect(local?.meetsQualityBar).toBe(true);
    expect(local?.correct).toBe(1);
    expect(luna?.wrong).toBe(1);
    expect(luna?.meetsQualityBar).toBe(false);
    expect(result.recommendation?.backendId).toBe("local-cheap");
    expect(result.disagreements.length).toBe(1);
  });

  it("skips Luna when unkeyed and still recommends local", async () => {
    const result = await runFanoutEval(
      {
        mode: "bulk",
        cases: [billingCase],
        backends: [
          { id: "local", costPerCase: 0.01 },
          { id: "openai/gpt-6-luna", model: "gpt-6-luna", costPerCase: 1 },
        ],
      },
      { env: {}, decide: decideBilling }
    );
    const luna = result.reports.find((r) => r.backendId === "openai/gpt-6-luna");
    expect(luna?.skipped).toBe(1);
    expect(luna?.skipReason).toMatch(/OPENAI_API_KEY/);
    expect(result.recommendation?.backendId).toBe("local");
  });

  it("POST /decision/eval returns fanout_eval shape", async () => {
    const app = express();
    app.use(express.json());
    app.use(createDecisionRouter({ env: {}, decide: decideBilling }));
    const server = createServer(app);
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("expected port");

    try {
      const res = await httpJson(`http://127.0.0.1:${address.port}/decision/eval`, {
        method: "POST",
        body: JSON.stringify({
          mode: "bulk",
          backends: [{ id: "local", costPerCase: 0 }],
          cases: [billingCase],
        }),
      });
      expect(res.status).toBe(200);
      const body = res.body as {
        object: string;
        recommendation?: { backendId: string };
        reports: Array<{ backendId: string; meetsQualityBar: boolean }>;
      };
      expect(body.object).toBe("clawql.decision.fanout_eval");
      expect(body.recommendation?.backendId).toBe("local");
      expect(body.reports[0]?.meetsQualityBar).toBe(true);

      const bad = await httpJson(`http://127.0.0.1:${address.port}/v1/decisions/eval`, {
        method: "POST",
        body: JSON.stringify({ mode: "ensemble", cases: [], backends: [] }),
      });
      expect(bad.status).toBe(400);
    } finally {
      await closeHttpServer(server);
    }
  });
});
