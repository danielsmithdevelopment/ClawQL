import { Effect } from "effect";
import { afterEach, describe, expect, it } from "vitest";
import { AuditService } from "../../audit/audit-service.js";
import type { ClawQLPluginRegistrationApi } from "../../plugin/registration-api.js";
import { draftFromForms } from "./inference/from-forms.js";
import { draftFromGraphql } from "./inference/from-graphql.js";
import { draftFromOpenApi } from "./inference/from-openapi.js";
import { WebMcpDraftPlugin, WebMcpDraftTestLayer } from "./index.js";
import { reviewDraft } from "./lifecycle/approval.js";
import {
  DraftStoreService,
  resetDefaultDraftStoreForTests,
} from "./lifecycle/draft-store.js";
import { generatePublishScript } from "./lifecycle/publish.js";
import { preIngestGate } from "./lifecycle/pre-ingest-gate.js";
import { rollbackPublishedVersion } from "./lifecycle/rollback.js";

const run = <A, E>(program: Effect.Effect<A, E, DraftStoreService | AuditService>) =>
  Effect.runPromise(program.pipe(Effect.provide(WebMcpDraftTestLayer)));

describe("webmcp-draft inference", () => {
  it("drafts user-facing OpenAPI ops and skips health", async () => {
    const candidates = await Effect.runPromise(
      draftFromOpenApi({
        openapi: "3.0.3",
        paths: {
          "/health": {
            get: { operationId: "getHealth", summary: "Health check" },
          },
          "/cart/items": {
            post: {
              operationId: "addToCart",
              summary: "Add item to cart",
              parameters: [
                {
                  name: "productId",
                  in: "query",
                  required: true,
                  schema: { type: "string" },
                },
              ],
              requestBody: {
                content: {
                  "application/json": {
                    schema: {
                      type: "object",
                      properties: { quantity: { type: "integer" } },
                      required: ["quantity"],
                    },
                  },
                },
              },
            },
          },
          "/internal/admin/users": {
            get: { operationId: "listAdminUsers", tags: ["admin"] },
          },
        },
      })
    );
    expect(candidates.map((c) => c.proposedTool.name)).toEqual(["add_to_cart"]);
    expect(candidates[0]?.confidence).toBe("high");
    expect(candidates[0]?.proposedTool.inputSchema.properties).toMatchObject({
      productId: { type: "string" },
      quantity: { type: "integer" },
    });
  });

  it("drafts GraphQL mutations from SDL", async () => {
    const candidates = await Effect.runPromise(
      draftFromGraphql({
        sdl: `
          type Mutation {
            healthPing: Boolean
            addToCart(productId: ID!, quantity: Int!): Cart
            checkout(cartId: ID!): Order
          }
        `,
      })
    );
    const names = candidates.map((c) => c.proposedTool.name);
    expect(names).toContain("add_to_cart");
    expect(names).toContain("checkout");
    expect(names).not.toContain("health_ping");
  });

  it("drafts HTML forms at low confidence", async () => {
    const candidates = await Effect.runPromise(
      draftFromForms([
        {
          selector: "form#upload",
          action: "/upload",
          method: "POST",
          name: "upload_photo",
          fields: [
            { name: "file", type: "file", label: "Photo", required: true },
            { name: "caption", type: "text", label: "Caption" },
          ],
        },
      ])
    );
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.confidence).toBe("low");
    expect(candidates[0]?.proposedTool.name).toContain("upload_photo");
  });
});

describe("webmcp-draft lifecycle", () => {
  afterEach(() => {
    resetDefaultDraftStoreForTests();
  });

  it("approve → publish script → rollback chain", async () => {
    const result = await run(
      Effect.gen(function* () {
        const store = yield* DraftStoreService;
        const drafted = yield* draftFromOpenApi({
          paths: {
            "/cart/items": {
              post: {
                operationId: "addToCart",
                summary: "Add to cart",
                requestBody: {
                  content: {
                    "application/json": {
                      schema: {
                        type: "object",
                        properties: { productId: { type: "string" } },
                        required: ["productId"],
                      },
                    },
                  },
                },
              },
            },
          },
        });
        yield* store.putCandidates(drafted);
        const candidateId = drafted[0]!.candidateId;

        const reviewed = yield* reviewDraft({
          candidateId,
          action: "edit-and-approve",
          editedTool: { name: "add_to_cart", description: "Add a product to the shopping cart" },
          reviewedBy: "daniel",
        });
        expect(reviewed.status).toBe("published");

        const active = yield* store.getActiveVersion();
        expect(active).not.toBeNull();
        const script = yield* generatePublishScript(active!);
        expect(script).toContain("document.modelContext");
        expect(script).toContain("registerTool");
        expect(script).toContain("add_to_cart");
        expect(script).toContain("callBoundOperation");

        const firstVersionId = active!.versionId;

        // Second publish path: draft another op, approve (auto-publish)
        const more = yield* draftFromOpenApi({
          paths: {
            "/orders/{id}/track": {
              get: {
                operationId: "trackOrder",
                summary: "Track order",
                parameters: [
                  { name: "id", in: "path", required: true, schema: { type: "string" } },
                ],
              },
            },
          },
        });
        yield* store.putCandidates(more);
        yield* reviewDraft({
          candidateId: more[0]!.candidateId,
          action: "approve",
          reviewedBy: "daniel",
        });
        const second = yield* store.getActiveVersion();
        expect(second?.previousVersionId).toBe(firstVersionId);

        const rolled = yield* rollbackPublishedVersion({
          versionId: firstVersionId,
          publishedBy: "daniel",
        });
        expect(rolled.publishedTools.map((t) => t.name)).toEqual(["add_to_cart"]);
        const audit = yield* AuditService;
        const listed = yield* audit.list(20);
        expect(listed.entries.some((e) => e.action === "WEBMCP_DRAFT_APPROVED")).toBe(true);
        expect(listed.entries.some((e) => e.action === "WEBMCP_DRAFT_PUBLISHED")).toBe(true);
        expect(listed.entries.some((e) => e.action === "WEBMCP_DRAFT_ROLLBACK")).toBe(true);

        return { script, rolled };
      })
    );

    expect(result.script).toContain("add_to_cart");
    expect(result.rolled.previousVersionId).not.toBeNull();
  });

  it("pre-ingest gate blocks undeclared tool names", async () => {
    await run(
      Effect.gen(function* () {
        const store = yield* DraftStoreService;
        const drafted = yield* draftFromOpenApi({
          paths: {
            "/cart/items": {
              post: { operationId: "addToCart", summary: "Add to cart" },
            },
          },
        });
        yield* store.putCandidates(drafted);
        yield* reviewDraft({
          candidateId: drafted[0]!.candidateId,
          action: "approve",
          reviewedBy: "daniel",
        });

        yield* preIngestGate({
          name: "add_to_cart",
          description: "ok",
          inputSchema: { type: "object", properties: {} },
        });

        const blocked = yield* preIngestGate({
          name: "delete_everything",
          description: "nope",
          inputSchema: { type: "object", properties: {} },
        }).pipe(Effect.either);
        expect(blocked._tag).toBe("Left");
      })
    );
  });

  it("rejects a draft without publishing", async () => {
    await run(
      Effect.gen(function* () {
        const store = yield* DraftStoreService;
        const drafted = yield* draftFromOpenApi({
          paths: {
            "/cart/items": {
              post: { operationId: "addToCart", summary: "Add to cart" },
            },
          },
        });
        yield* store.putCandidates(drafted);
        const rejected = yield* reviewDraft({
          candidateId: drafted[0]!.candidateId,
          action: "reject",
          reviewedBy: "daniel",
        });
        expect(rejected.status).toBe("rejected");
        expect(yield* store.getActiveVersion()).toBeNull();
      })
    );
  });
});

describe("WebMcpDraftPlugin", () => {
  it("registers draft/review/publish/rollback tools", async () => {
    const names: string[] = [];
    const api: ClawQLPluginRegistrationApi = {
      registerMcpTool: (tool) =>
        Effect.sync(() => {
          names.push(tool.name);
        }),
    };
    await Effect.runPromise(WebMcpDraftPlugin.onRegister!(api));
    expect(names).toEqual([
      "webmcp_draft",
      "webmcp_draft_review",
      "webmcp_draft_publish",
      "webmcp_draft_rollback",
    ]);
  });
});
