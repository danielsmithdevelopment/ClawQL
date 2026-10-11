/**
 * Decision gateway HTTP + honesty tests (heuristic stack).
 */

import { createServer, request, type Server } from "node:http";
import { once } from "node:events";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Effect } from "effect";
import { createInferenceHttpApp } from "../api/server.js";
import { ConfiguredInferenceGateway } from "../gateway.js";
import { createOpenAiAdapter } from "../plugin/adapters/openai.js";
import { resetDecisionRuntime, useHeuristicDecisionStackForTests } from "./service.js";
import { createDecisionRouter } from "./router.js";
import {
  DecisionsPolicyLive,
  DecisionsPolicyService,
  classifyDecisionsModel,
  refusalsForFailClosed,
} from "./policy.js";
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

const UNCALIBRATED_HEADER = { "x-clawql-allow-uncalibrated": "1" };

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
        answers: Array<{ type: string; score?: number; calibrated?: boolean; options?: unknown[] }>;
      };
      expect(body.answers[0]?.type).toBe("score");
      expect(typeof body.answers[0]?.score).toBe("number");
      expect(body.answers[0]?.calibrated).toBe(false);
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

  it("POST /v1/decisions fail-closes uncalibrated to refusal; opt-in returns choice", async () => {
    const app = express();
    app.use(express.json());
    app.use(createDecisionRouter({ env: {} }));
    const server = createServer(app);
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("expected port");

    const payload = {
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
    };

    try {
      const closed = await httpJson(`http://127.0.0.1:${address.port}/v1/decisions`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      expect(closed.status).toBe(200);
      const closedBody = closed.body as {
        answers: Array<{ type: string; refusal?: string; choice?: string }>;
        calibrated: boolean;
        usage?: { total_tokens: number };
      };
      expect(closedBody.answers[0]?.type).toBe("refusal");
      expect(closedBody.answers[0]?.refusal).toMatch(/not calibrated|opt in/i);
      expect(closedBody.calibrated).toBe(false);
      expect(closedBody.usage?.total_tokens).toBe(0);

      const open = await httpJson(`http://127.0.0.1:${address.port}/v1/decisions`, {
        method: "POST",
        headers: UNCALIBRATED_HEADER,
        body: JSON.stringify(payload),
      });
      expect(open.status).toBe(200);
      const openBody = open.body as {
        object: string;
        answers: Array<{ type: string; choice?: string; confidence?: number }>;
        calibrated: boolean;
        backend_id: string;
      };
      expect(openBody.object).toBe("decision");
      expect(openBody.answers[0]?.type).toBe("choice");
      expect(openBody.answers[0]?.choice).toBe("billing");
      expect(typeof openBody.answers[0]?.confidence).toBe("number");
      expect(openBody.calibrated).toBe(false);
      expect(openBody.backend_id).toBe("heuristic");
    } finally {
      await closeHttpServer(server);
    }
  });

  it("POST /v1/decisions refuses score by default; images need egress even with Luna key", async () => {
    const app = express();
    app.use(express.json());
    app.use(
      createDecisionRouter({
        env: { OPENAI_API_KEY: "sk-test" },
        callRemote: async () => {
          throw new Error("should not call remote without image egress");
        },
      })
    );
    const server = createServer(app);
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("expected port");

    try {
      const pred = await httpJson(`http://127.0.0.1:${address.port}/v1/decisions`, {
        method: "POST",
        headers: UNCALIBRATED_HEADER,
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

      const scoreClosed = await httpJson(`http://127.0.0.1:${address.port}/v1/decisions`, {
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
      expect(scoreClosed.status).toBe(200);
      const scoreClosedBody = scoreClosed.body as {
        answers: Array<{ type: string; refusal?: string }>;
      };
      expect(scoreClosedBody.answers[0]?.type).toBe("refusal");
      expect(scoreClosedBody.answers[0]?.refusal).toMatch(/score|not calibrated/i);

      const scoreOpen = await httpJson(`http://127.0.0.1:${address.port}/v1/decisions`, {
        method: "POST",
        headers: UNCALIBRATED_HEADER,
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
      expect(scoreOpen.status).toBe(200);
      const scoreBody = scoreOpen.body as {
        answers: Array<{
          type: string;
          score?: number;
          probabilities?: Array<{ label: string; value: number }>;
        }>;
        calibrated: boolean;
      };
      expect(scoreBody.answers[0]?.type).toBe("score");
      expect(typeof scoreBody.answers[0]?.score).toBe("number");
      expect(scoreBody.answers[0]?.probabilities?.[0]?.label).toBe("Cosmetic");
      expect(scoreBody.calibrated).toBe(false);

      const img = await httpJson(`http://127.0.0.1:${address.port}/v1/decisions`, {
        method: "POST",
        headers: UNCALIBRATED_HEADER,
        body: JSON.stringify({
          model: "gpt-6-luna",
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
      expect(imgBody.answers[0]?.refusal).toMatch(/egress|consent|allow.external.images/i);
    } finally {
      await closeHttpServer(server);
    }
  });

  it("POST /v1/decisions forwards images to Luna only with egress + uncalibrated opt-in", async () => {
    let remoteCalls = 0;
    const app = express();
    app.use(express.json());
    app.use(
      createDecisionRouter({
        env: { OPENAI_API_KEY: "sk-test" },
        callRemote: async () => {
          remoteCalls += 1;
          return {
            id: "decision_remote",
            object: "decision",
            model: "gpt-6-luna",
            created: 1,
            answers: [
              {
                type: "predicate",
                name: "visible_damage",
                probability: 0.88,
              },
            ],
            usage: {
              input_tokens: 10,
              output_tokens: 2,
              total_tokens: 12,
              input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
              output_tokens_details: { reasoning_tokens: 0 },
            },
            calibrated: false,
            escalated: false,
            use_site_id: "search_provider_tool_routing",
            backend_id: "openai/gpt-6-luna",
            trace_id: "remote",
          };
        },
      })
    );
    const server = createServer(app);
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("expected port");

    const imagePayload = {
      model: "clawql-auto",
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
    };

    try {
      const res = await httpJson(`http://127.0.0.1:${address.port}/v1/decisions`, {
        method: "POST",
        headers: {
          ...UNCALIBRATED_HEADER,
          "x-clawql-allow-external-images": "1",
        },
        body: JSON.stringify(imagePayload),
      });
      expect(res.status).toBe(200);
      expect(remoteCalls).toBe(1);
      const body = res.body as {
        answers: Array<{ type: string; probability?: number }>;
        backend_id: string;
      };
      expect(body.backend_id).toBe("openai/gpt-6-luna");
      expect(body.answers[0]?.type).toBe("predicate");
      expect(body.answers[0]?.probability).toBe(0.88);
    } finally {
      await closeHttpServer(server);
    }
  });

  it("POST /v1/decisions refuses Luna answers by default; unknown models error", async () => {
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
      const closed = await httpJson(`http://127.0.0.1:${address.port}/v1/decisions`, {
        method: "POST",
        body: JSON.stringify({
          model: "gpt-6-luna",
          input: "I was charged twice for my order.",
          questions: [
            {
              type: "choice",
              name: "department",
              instructions: "Pick a department",
              choices: [
                { value: "billing", description: "Payments" },
                { value: "other", description: "Other" },
              ],
            },
          ],
        }),
      });
      expect(closed.status).toBe(200);
      const closedBody = closed.body as {
        answers: Array<{ type: string; refusal?: string }>;
        calibrated: boolean;
      };
      expect(closedBody.answers[0]?.type).toBe("refusal");
      expect(closedBody.calibrated).toBe(false);

      const open = await httpJson(`http://127.0.0.1:${address.port}/v1/decisions`, {
        method: "POST",
        headers: UNCALIBRATED_HEADER,
        body: JSON.stringify({
          model: "gpt-6-luna",
          input: "I was charged twice for my order.",
          questions: [
            {
              type: "choice",
              name: "department",
              instructions: "Pick a department",
              choices: [
                { value: "billing", description: "Payments" },
                { value: "other", description: "Other" },
              ],
            },
          ],
        }),
      });
      expect(open.status).toBe(200);
      const openBody = open.body as {
        backend_id: string;
        answers: Array<{ choice?: string }>;
      };
      expect(openBody.backend_id).toBe("openai/gpt-6-luna");
      expect(openBody.answers[0]?.choice).toBe("billing");

      const bad = await httpJson(`http://127.0.0.1:${address.port}/v1/decisions`, {
        method: "POST",
        body: JSON.stringify({
          model: "gpt-4o",
          input: "hello",
          questions: [
            {
              type: "predicate",
              name: "ok",
              instructions: "Is this ok?",
            },
          ],
        }),
      });
      expect(bad.status).toBe(400);
      const badBody = bad.body as { error: { message: string; type: string } };
      expect(badBody.error.type).toBe("invalid_request_error");
      expect(badBody.error.message).toMatch(/Invalid model|gpt-4o|clawql-auto/i);
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

  it("policy classifies models and forces score refusals when closed", async () => {
    const kinds = await Promise.all(
      ["clawql-auto", "gpt-6-luna", "microsoft-decision-1", "gpt-4o"].map((m) =>
        Effect.runPromise(classifyDecisionsModel(m))
      )
    );
    expect(kinds).toEqual(["local", "luna", "microsoft", "unknown"]);

    const refusals = Effect.runSync(
      refusalsForFailClosed({
        questions: [
          {
            type: "score",
            name: "severity",
            levels: [{ label: "low" }, { label: "high" }],
          },
        ],
        answers: [
          {
            name: "severity",
            type: "score",
            score: 1,
            abstained: false,
            escalated: false,
            calibrated: false,
            backendId: "gliner2",
            useSiteId: "search_provider_tool_routing",
          },
        ],
        allowUncalibrated: false,
      }).pipe(Effect.provide(DecisionsPolicyLive))
    );
    expect(refusals[0]?.name).toBe("severity");

    const msg = Effect.runSync(
      Effect.gen(function* () {
        const policy = yield* DecisionsPolicyService;
        return yield* policy.modelRejectionMessage("gpt-4o", "unknown");
      }).pipe(Effect.provide(DecisionsPolicyLive))
    );
    expect(msg).toMatch(/Invalid model/);
  });
});
