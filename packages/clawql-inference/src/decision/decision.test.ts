/**
 * Decision gateway HTTP + honesty tests (heuristic stack).
 */

import { createServer, request, type Server } from "node:http";
import { once } from "node:events";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createInferenceHttpApp } from "../api/server.js";
import { ConfiguredInferenceGateway } from "../gateway.js";
import { createOpenAiAdapter } from "../plugin/adapters/openai.js";
import { resetDecisionRuntime, useHeuristicDecisionStackForTests } from "./service.js";
import { createDecisionRouter } from "./router.js";
import express from "express";

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

describe("decision gateway", () => {
  beforeEach(() => {
    useHeuristicDecisionStackForTests();
  });

  afterEach(() => {
    resetDecisionRuntime();
  });

  it("POST /decision and /v1/systemone return clawql.decision with calibrated=false on heuristic", async () => {
    const gateway = new ConfiguredInferenceGateway(
      new Map([
        [
          "openai",
          createOpenAiAdapter({ apiKey: "test-key", baseUrl: "https://api.openai.com/v1" }),
        ],
      ])
    );
    const app = createInferenceHttpApp({ gateway });
    const server = createServer(app);
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("expected port");

    const payload = {
      state: "github merge pull request",
      useSiteId: "search_provider_tool_routing",
      questions: [
        {
          type: "choice",
          name: "tool",
          options: [
            { id: "github.pulls.merge", description: "github merge pull request" },
            { id: "slack.chat.post", description: "slack post message" },
          ],
        },
      ],
    };

    try {
      const decision = await httpJson(`http://127.0.0.1:${address.port}/decision`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      expect(decision.status).toBe(200);
      const body = decision.body as {
        object: string;
        calibrated: boolean;
        backendId: string;
        answers: Array<{ answer?: string; calibrated: boolean; abstained: boolean }>;
      };
      expect(body.object).toBe("clawql.decision");
      expect(body.backendId).toBe("heuristic");
      expect(body.calibrated).toBe(false);
      expect(body.answers[0]?.calibrated).toBe(false);
      expect(body.answers[0]?.answer).toBe("github.pulls.merge");

      const alias = await httpJson(`http://127.0.0.1:${address.port}/v1/systemone`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      expect(alias.status).toBe(200);
      expect((alias.body as { object: string }).object).toBe("clawql.decision");
    } finally {
      await closeHttpServer(server);
    }
  });

  it("supports score questions with probability-weighted level indices", async () => {
    const app = express();
    app.use(express.json());
    app.use(createDecisionRouter());
    const server = createServer(app);
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("expected port");

    try {
      const res = await httpJson(`http://127.0.0.1:${address.port}/decision`, {
        method: "POST",
        body: JSON.stringify({
          state: "Export fails in Safari but works in Chrome with another browser.",
          questions: [
            {
              type: "score",
              name: "severity",
              instructions: "How severe is this issue?",
              levels: [
                { label: "Cosmetic", description: "Appearance only; no lost functionality." },
                {
                  label: "Workaround available",
                  description: "A task fails, but another way works.",
                },
                { label: "Fully blocked", description: "A task fails with no workaround." },
              ],
            },
          ],
        }),
      });
      expect(res.status).toBe(200);
      const body = res.body as {
        answers: Array<{ type: string; score?: number; options?: unknown[] }>;
      };
      expect(body.answers[0]?.type).toBe("score");
      expect(typeof body.answers[0]?.score).toBe("number");
      expect(body.answers[0]?.options?.length).toBe(3);

      const empty = await httpJson(`http://127.0.0.1:${address.port}/decision`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      expect(empty.status).toBe(400);
    } finally {
      await closeHttpServer(server);
    }
  });

  it("POST /v1/decisions accepts OpenAI choice shape (ticket triage demo)", async () => {
    const app = express();
    app.use(express.json());
    app.use(createDecisionRouter({ env: {} }));
    const server = createServer(app);
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("expected port");

    try {
      const res = await httpJson(`http://127.0.0.1:${address.port}/v1/decisions`, {
        method: "POST",
        body: JSON.stringify({
          model: "clawql",
          input: "I was charged twice for my order.",
          questions: [
            {
              type: "choice",
              name: "department",
              instructions: "Which department should handle this complaint?",
              choices: [
                { value: "billing", description: "Payments, invoices, and refunds." },
                { value: "technical", description: "Problems using the product." },
                { value: "shipping", description: "Delivery and tracking." },
                { value: "other", description: "Requests outside these categories." },
              ],
            },
          ],
        }),
      });
      expect(res.status).toBe(200);
      const body = res.body as {
        object: string;
        model: string;
        answers: Array<{
          type: string;
          name: string;
          choice?: string;
          confidence?: number;
          probabilities?: unknown[];
        }>;
        calibrated: boolean;
        backend_id: string;
        trace_id: string;
      };
      expect(body.object).toBe("decision");
      expect(body.answers[0]?.type).toBe("choice");
      expect(body.answers[0]?.name).toBe("department");
      expect(body.answers[0]?.choice).toBe("billing");
      expect(typeof body.answers[0]?.confidence).toBe("number");
      expect(body.calibrated).toBe(false);
      expect(body.backend_id).toBe("heuristic");
      expect(body.trace_id).toBeTruthy();
    } finally {
      await closeHttpServer(server);
    }
  });

  it("POST /v1/decisions maps predicate and score; refuses images without Luna key", async () => {
    const app = express();
    app.use(express.json());
    app.use(createDecisionRouter({ env: {} }));
    const server = createServer(app);
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("expected port");

    try {
      const pred = await httpJson(`http://127.0.0.1:${address.port}/v1/decisions`, {
        method: "POST",
        body: JSON.stringify({
          model: "gliner2",
          input: "The package arrived with a deep crack across the plastic housing.",
          questions: [
            {
              type: "predicate",
              name: "visible_damage",
              instructions: "Does the product have visible damage such as a crack or dent?",
            },
          ],
        }),
      });
      expect(pred.status).toBe(200);
      const predBody = pred.body as {
        answers: Array<{ type: string; probability?: number }>;
      };
      expect(predBody.answers[0]?.type).toBe("predicate");
      expect(typeof predBody.answers[0]?.probability).toBe("number");

      const score = await httpJson(`http://127.0.0.1:${address.port}/v1/decisions`, {
        method: "POST",
        body: JSON.stringify({
          model: "clawql",
          input: "Export fails in Safari but works in Chrome.",
          questions: [
            {
              type: "score",
              name: "severity",
              instructions: "How severe is this issue?",
              levels: [
                { label: "Cosmetic", description: "Appearance only." },
                { label: "Workaround available", description: "Another way works." },
                { label: "Fully blocked", description: "No workaround." },
              ],
            },
          ],
        }),
      });
      expect(score.status).toBe(200);
      const scoreBody = score.body as {
        answers: Array<{ type: string; score?: number }>;
      };
      expect(scoreBody.answers[0]?.type).toBe("score");
      expect(typeof scoreBody.answers[0]?.score).toBe("number");

      const img = await httpJson(`http://127.0.0.1:${address.port}/v1/decisions`, {
        method: "POST",
        body: JSON.stringify({
          model: "clawql",
          input: [
            {
              role: "user",
              content: [
                { type: "input_text", text: "Inspect the product." },
                { type: "input_image", image_url: "data:image/png;base64,AAAA" },
              ],
            },
          ],
          questions: [
            {
              type: "predicate",
              name: "visible_damage",
              instructions: "Is there visible damage?",
            },
          ],
        }),
      });
      expect(img.status).toBe(200);
      const imgBody = img.body as {
        answers: Array<{ type: string; refusal?: string }>;
      };
      expect(imgBody.answers[0]?.type).toBe("refusal");
      expect(imgBody.answers[0]?.refusal).toMatch(/vision|luna|OPENAI_API_KEY/i);
    } finally {
      await closeHttpServer(server);
    }
  });

  it("POST /v1/decisions forwards to Luna when model=gpt-6-luna", async () => {
    const app = express();
    app.use(express.json());
    app.use(
      createDecisionRouter({
        env: { OPENAI_API_KEY: "sk-test" },
        callRemote: async () => ({
          id: "decision_remote",
          object: "decision",
          model: "gpt-6-luna",
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
          calibrated: false,
          escalated: false,
          use_site_id: "search_provider_tool_routing",
          backend_id: "openai/gpt-6-luna",
          trace_id: "remote",
        }),
      })
    );
    const server = createServer(app);
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("expected port");

    try {
      const res = await httpJson(`http://127.0.0.1:${address.port}/v1/decisions`, {
        method: "POST",
        body: JSON.stringify({
          model: "gpt-6-luna",
          input: "I was charged twice for my order.",
          questions: [
            {
              type: "choice",
              name: "department",
              choices: [
                { value: "billing", description: "Payments" },
                { value: "other", description: "Other" },
              ],
            },
          ],
        }),
      });
      expect(res.status).toBe(200);
      const body = res.body as {
        backend_id: string;
        calibrated: boolean;
        answers: Array<{ choice?: string }>;
      };
      expect(body.backend_id).toBe("openai/gpt-6-luna");
      expect(body.calibrated).toBe(false);
      expect(body.answers[0]?.choice).toBe("billing");
    } finally {
      await closeHttpServer(server);
    }
  });

  it("exploratory use sites default to escalate on abstain", async () => {
    const app = express();
    app.use(express.json());
    app.use(createDecisionRouter());
    const server = createServer(app);
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("expected port");

    try {
      const res = await httpJson(`http://127.0.0.1:${address.port}/decision`, {
        method: "POST",
        body: JSON.stringify({
          state: "zzzz unmatched gibberish",
          useSiteId: "skill_fast_path_match",
          questions: [
            {
              type: "choice",
              name: "skill",
              options: [
                { id: "a", description: "alpha only" },
                { id: "b", description: "beta only" },
              ],
            },
          ],
        }),
      });
      expect(res.status).toBe(200);
      const body = res.body as {
        calibrated: boolean;
        answers: Array<{ abstained: boolean; escalated: boolean; calibrated: boolean }>;
      };
      expect(body.calibrated).toBe(false);
      if (body.answers[0]?.abstained) {
        expect(body.answers[0]?.escalated).toBe(true);
      }
    } finally {
      await closeHttpServer(server);
    }
  });
});
