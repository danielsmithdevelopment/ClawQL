import { Effect, Layer } from "effect";
import { afterEach, describe, expect, it } from "vitest";
import { AuditService } from "../../audit/audit-service.js";
import type { PluginInstallServices } from "../../plugin/provider-types.js";
import {
  atrScopeFromTokens,
  fireHook,
  fireHooksForEvent,
  HookRegistry,
  installPlugin,
  makeCapturingWormLayer,
  makeRecordingRegistrationApi,
} from "../../plugin/index.js";
import { draftFromForms } from "./inference/from-forms.js";
import { draftFromGraphql } from "./inference/from-graphql.js";
import { draftFromOpenApi } from "./inference/from-openapi.js";
import { WebMcpDraftPlugin, WebMcpDraftTestLayer } from "./index.js";
import { reviewDraft } from "./lifecycle/approval.js";
import {
  DraftStoreLive,
  DraftStoreService,
  resetDefaultDraftStoreForTests,
} from "./lifecycle/draft-store.js";
import {
  preIngestGate,
  webMcpDraftPreIngestHook,
} from "./lifecycle/pre-ingest-gate.js";
import { generatePublishScript } from "./lifecycle/publish.js";
import { rollbackPublishedVersion } from "./lifecycle/rollback.js";

const run = <A, E>(
  program: Effect.Effect<A, E, DraftStoreService | AuditService | PluginInstallServices>
) => Effect.runPromise(program.pipe(Effect.provide(WebMcpDraftTestLayer)));

/** Install plugin so HookRegistry has the pre-ingest LifecycleHook. */
const installDraftPluginHooks = Effect.gen(function* () {
  const { api } = makeRecordingRegistrationApi();
  yield* installPlugin(WebMcpDraftPlugin, {
    registrationApi: api,
    pluginId: WebMcpDraftPlugin.id,
  });
});

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
  });
});

describe("webmcp-draft lifecycle via core fireHook", () => {
  afterEach(() => {
    resetDefaultDraftStoreForTests();
  });

  it("exposes ephemeral durability on the stub store", async () => {
    await run(
      Effect.gen(function* () {
        const store = yield* DraftStoreService;
        expect(store.durability).toBe("ephemeral");
      })
    );
  });

  it("install registers pre-ingest hook; approve→publish uses fireHooksForEvent", async () => {
    const result = await run(
      Effect.gen(function* () {
        yield* installDraftPluginHooks;
        const hooks = yield* HookRegistry;
        const listed = yield* hooks.list("pre-ingest");
        expect(listed.map((h) => h.id)).toContain("webmcp-draft-declare-allowlist");

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

        const reviewed = yield* reviewDraft({
          candidateId: drafted[0]!.candidateId,
          action: "edit-and-approve",
          editedTool: {
            name: "add_to_cart",
            description: "Add a product to the shopping cart",
          },
          reviewedBy: "daniel",
        });
        expect(reviewed.status).toBe("published");

        const active = yield* store.getActiveVersion();
        expect(active).not.toBeNull();
        const script = yield* generatePublishScript(active!);
        expect(script).toContain("document.modelContext");
        expect(script).toContain("fetch(BIND_URL");
        expect(script).toContain("/webmcp-draft/bound-execute");
        expect(script).not.toContain("stub: true");
        expect(script).toContain("add_to_cart");

        const firstVersionId = active!.versionId;
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
        const entries = yield* audit.list(30);
        expect(entries.entries.some((e) => e.action === "WEBMCP_DRAFT_APPROVED")).toBe(true);
        expect(entries.entries.some((e) => e.action === "WEBMCP_DRAFT_PUBLISHED")).toBe(true);
        expect(entries.entries.some((e) => e.action === "WEBMCP_DRAFT_ROLLBACK")).toBe(true);

        return { script };
      })
    );
    expect(result.script).toContain("add_to_cart");
  });

  it("core fireHook records HOOK_TRIGGERED and denies undeclared tools", async () => {
    resetDefaultDraftStoreForTests();
    const capture = makeCapturingWormLayer();
    const layer = Layer.mergeAll(DraftStoreLive, capture.layer);
    await Effect.runPromise(
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
        yield* store.markReviewed({
          candidateId: drafted[0]!.candidateId,
          status: "approved",
          reviewedBy: "daniel",
        });

        const allowed = yield* fireHook(
          { ...webMcpDraftPreIngestHook, pluginId: "clawql-webmcp-draft" },
          {
            session: { id: "s1", atrScope: atrScopeFromTokens([]) },
            payload: {
              name: "add_to_cart",
              description: "ok",
              inputSchema: { type: "object", properties: {} },
            },
          }
        );
        expect(allowed.allow).toBe(true);

        const denied = yield* fireHook(
          { ...webMcpDraftPreIngestHook, pluginId: "clawql-webmcp-draft" },
          {
            session: { id: "s1", atrScope: atrScopeFromTokens([]) },
            payload: {
              name: "delete_everything",
              description: "nope",
              inputSchema: { type: "object", properties: {} },
            },
          }
        );
        expect(denied.allow).toBe(false);

        const events = yield* capture.events();
        expect(events.filter((e) => e.type === "HOOK_TRIGGERED")).toHaveLength(2);
      }).pipe(Effect.provide(layer))
    );
  });

  it("fireHooksForEvent short-circuits on deny when hook is registered", async () => {
    await run(
      Effect.gen(function* () {
        yield* installDraftPluginHooks;
        const hooks = yield* HookRegistry;
        const registered = yield* hooks.list("pre-ingest");
        const denied = yield* fireHooksForEvent(registered, {
          session: { id: "s2", atrScope: atrScopeFromTokens([]) },
          payload: {
            name: "not_a_real_draft",
            description: "x",
            inputSchema: { type: "object" },
          },
        });
        expect(denied.allow).toBe(false);
      })
    );
  });

  it("rejects a draft without publishing", async () => {
    await run(
      Effect.gen(function* () {
        yield* installDraftPluginHooks;
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

describe("WebMcpDraftPlugin (ProviderPlugin)", () => {
  afterEach(() => {
    resetDefaultDraftStoreForTests();
  });

  it("install registers MCP tools and pre-ingest LifecycleHook", async () => {
    const { api, tools } = makeRecordingRegistrationApi();
    await run(
      Effect.gen(function* () {
        yield* installPlugin(WebMcpDraftPlugin, {
          registrationApi: api,
          pluginId: WebMcpDraftPlugin.id,
        });
        const hooks = yield* HookRegistry;
        const listed = yield* hooks.list("pre-ingest");
        expect(listed.some((h) => h.id === "webmcp-draft-declare-allowlist")).toBe(true);
        expect(tools).toEqual([
          "webmcp_draft",
          "webmcp_draft_review",
          "webmcp_draft_publish",
          "webmcp_draft_execute",
          "webmcp_draft_rollback",
        ]);
      })
    );
  });

  it("preIngestGate predicate alone is not the composition path", async () => {
    await run(
      Effect.gen(function* () {
        const blocked = yield* preIngestGate({
          name: "ghost",
          description: "x",
          inputSchema: { type: "object", properties: {} },
        }).pipe(Effect.either);
        expect(blocked._tag).toBe("Left");
      })
    );
  });
});
