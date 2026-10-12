/**
 * GW-16 — Official OpenAI JavaScript SDK against ClawQL POST /v1/decisions.
 * Covers predicate, choice, score, refusal, and invalid-model error.
 */

import { createServer, type Server } from "node:http";
import { once } from "node:events";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import OpenAI, { APIError } from "openai";
import express from "express";
import { createDecisionRouter } from "./router.js";
import { resetDecisionRuntime, useHeuristicDecisionStackForTests } from "./service.js";

function closeHttpServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof server.closeIdleConnections === "function") {
      server.closeIdleConnections();
    }
    server.close((err) => (err ? reject(err) : resolve()));
  });
}

describe("GW-16 OpenAI JS SDK /v1/decisions conformance", () => {
  let server: Server;
  let baseURL: string;
  let client: OpenAI;

  beforeEach(async () => {
    useHeuristicDecisionStackForTests();
    const app = express();
    app.use(express.json({ limit: "2mb" }));
    app.use(createDecisionRouter({ env: {} }));
    server = createServer(app);
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("expected port");
    baseURL = `http://127.0.0.1:${address.port}/v1`;
    client = new OpenAI({
      apiKey: "sk-clawql-test",
      baseURL,
      maxRetries: 0,
    });
  });

  afterEach(async () => {
    resetDecisionRuntime();
    await closeHttpServer(server);
  });

  it("returns refusal for uncalibrated choice (SDK-visible fail-closed)", async () => {
    const decision = await client.decisions.create({
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
          ],
        },
      ],
    });
    expect(decision.model).toBe("clawql");
    expect(decision.answers[0]?.type).toBe("refusal");
    expect(decision.answers[0]?.name).toBe("department");
  });

  it("returns predicate + choice when allow-uncalibrated header is set", async () => {
    const decision = await client.decisions.create(
      {
        model: "clawql-auto",
        input: "The package arrived with a deep crack across the plastic housing.",
        questions: [
          {
            type: "predicate",
            name: "visible_damage",
            instructions: "Does the product have visible damage such as a crack or dent?",
          },
          {
            type: "choice",
            name: "department",
            instructions: "Which department should handle this?",
            choices: [
              { value: "shipping", description: "Delivery and tracking." },
              { value: "billing", description: "Payments and refunds." },
            ],
          },
        ],
      },
      { headers: { "x-clawql-allow-uncalibrated": "1" } }
    );
    expect(decision.answers).toHaveLength(2);
    expect(decision.answers[0]?.type).toBe("predicate");
    if (decision.answers[0]?.type === "predicate") {
      expect(typeof decision.answers[0].probability).toBe("number");
    }
    expect(decision.answers[1]?.type).toBe("choice");
    if (decision.answers[1]?.type === "choice") {
      expect(typeof decision.answers[1].choice).toBe("string");
      expect(typeof decision.answers[1].confidence).toBe("number");
    }
  });

  it("returns score answers only with uncalibrated opt-in", async () => {
    const closed = await client.decisions.create({
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
    });
    expect(closed.answers[0]?.type).toBe("refusal");

    const open = await client.decisions.create(
      {
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
      },
      { headers: { "x-clawql-allow-uncalibrated": "1" } }
    );
    expect(open.answers[0]?.type).toBe("score");
    if (open.answers[0]?.type === "score") {
      expect(typeof open.answers[0].score).toBe("number");
      expect(open.answers[0].probabilities[0]?.label).toBe("Cosmetic");
      expect(typeof open.answers[0].probabilities[0]?.value).toBe("number");
    }
  });

  it("raises APIError for unknown models (OpenAI error shape)", async () => {
    await expect(
      client.decisions.create({
        model: "gpt-4o",
        input: "hello",
        questions: [
          {
            type: "predicate",
            name: "ok",
            instructions: "Is this ok?",
          },
        ],
      })
    ).rejects.toBeInstanceOf(APIError);

    try {
      await client.decisions.create({
        model: "gpt-4o",
        input: "hello",
        questions: [{ type: "predicate", name: "ok", instructions: "Is this ok?" }],
      });
      expect.fail("expected error");
    } catch (err) {
      expect(err).toBeInstanceOf(APIError);
      const apiErr = err as APIError;
      expect(apiErr.status).toBe(400);
      expect(apiErr.error).toMatchObject({ type: "invalid_request_error" });
    }
  });
});
