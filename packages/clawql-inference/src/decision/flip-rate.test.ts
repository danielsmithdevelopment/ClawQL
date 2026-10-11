/**
 * Flip-rate / perturbation gate tests (deterministic stub decide).
 */

import { createServer, request, type Server } from "node:http";
import { once } from "node:events";
import { describe, expect, it } from "vitest";
import express from "express";
import { createDecisionRouter } from "./router.js";
import { applyPerturbations, runFlipRate } from "./flip-rate.js";
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

const caseBody = {
  caseId: "billing-1",
  state: "I was charged twice for my order.",
  questions: [
    {
      type: "choice" as const,
      name: "department",
      options: [
        { id: "billing", description: "Payments" },
        { id: "shipping", description: "Delivery" },
      ],
    },
  ],
};

function stableDecide(_req: DecisionRequest): Promise<DecisionResponse> {
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

function flakyDecide(req: DecisionRequest): Promise<DecisionResponse> {
  const answer = /billed/i.test(req.state) ? "shipping" : "billing";
  return Promise.resolve({
    object: "clawql.decision",
    answers: [
      {
        name: "department",
        type: "choice",
        answer,
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

describe("flip-rate gate", () => {
  it("applyPerturbations is deterministic and includes synonym swaps", () => {
    const a = applyPerturbations("I was charged twice.", ["synonym", "case"]);
    const b = applyPerturbations("I was charged twice.", ["synonym", "case"]);
    expect(a).toEqual(b);
    expect(a.some((p) => p.family === "synonym" && /billed/i.test(p.state))).toBe(true);
  });

  it("passes when answers stay stable under perturbations", async () => {
    const result = await runFlipRate(
      {
        cases: [caseBody],
        maxFlipRate: 0.1,
        families: ["whitespace", "case", "punctuation", "synonym"],
      },
      { decide: stableDecide }
    );
    expect(result.object).toBe("clawql.decision.flip_rate");
    expect(result.passed).toBe(true);
    expect(result.reports[0]?.baseline).toBe("billing");
    expect(result.reports[0]?.flips).toBe(0);
    expect(result.reports[0]?.passed).toBe(true);
  });

  it("fails when synonym swap flips the answer", async () => {
    const result = await runFlipRate(
      {
        cases: [caseBody],
        maxFlipRate: 0,
        families: ["synonym"],
      },
      { decide: flakyDecide }
    );
    expect(result.passed).toBe(false);
    expect(result.reports[0]?.flips).toBeGreaterThan(0);
    expect(result.reports[0]?.flipRate).toBeGreaterThan(0);
  });

  it("POST /decision/flip-rate returns flip_rate shape", async () => {
    const app = express();
    app.use(express.json());
    app.use(createDecisionRouter({ env: {}, decide: stableDecide }));
    const server = createServer(app);
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("expected port");

    try {
      const res = await httpJson(`http://127.0.0.1:${address.port}/decision/flip-rate`, {
        method: "POST",
        body: JSON.stringify({
          cases: [caseBody],
          families: ["whitespace", "case"],
        }),
      });
      expect(res.status).toBe(200);
      const body = res.body as { object: string; passed: boolean };
      expect(body.object).toBe("clawql.decision.flip_rate");
      expect(body.passed).toBe(true);

      const bad = await httpJson(`http://127.0.0.1:${address.port}/v1/decisions/flip-rate`, {
        method: "POST",
        body: JSON.stringify({ cases: [] }),
      });
      expect(bad.status).toBe(400);
    } finally {
      await closeHttpServer(server);
    }
  });
});
