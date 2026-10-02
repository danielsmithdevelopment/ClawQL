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

  it("rejects score questions with an explicit 400", async () => {
    const app = express();
    app.use(express.json());
    app.use(createDecisionRouter());
    const server = createServer(app);
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("expected port");

    try {
      for (const path of ["/decision", "/v1/systemone"] as const) {
        const bad = await httpJson(`http://127.0.0.1:${address.port}${path}`, {
          method: "POST",
          body: JSON.stringify({
            state: "x",
            questions: [{ type: "score", name: "s", levels: ["a", "b"] }],
          }),
        });
        expect(bad.status).toBe(400);
        const err = bad.body as { error?: { message?: string } };
        expect(err.error?.message ?? JSON.stringify(bad.body)).toMatch(/score.*not supported/i);
      }

      const empty = await httpJson(`http://127.0.0.1:${address.port}/decision`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      expect(empty.status).toBe(400);
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
      // Low overlap → below threshold → escalate for non-trusted site
      if (body.answers[0]?.abstained) {
        expect(body.answers[0]?.escalated).toBe(true);
      }
    } finally {
      await closeHttpServer(server);
    }
  });
});
