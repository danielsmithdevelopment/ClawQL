import { Effect, Layer } from "effect";
import {
  AuditLive,
  AuditService,
  AuditTestLayer,
} from "../../audit/audit-service.js";
import type { ClawQLError, McpToolAlreadyRegisteredError } from "../../errors/clawql-error.js";
import type { ClawQLPluginRegistrationApi, McpToolResult } from "../../plugin/registration-api.js";
import type { Plugin } from "../../plugin/types.js";
import { reviewDraft } from "./lifecycle/approval.js";
import { DraftStoreLive, DraftStoreService, DraftStoreTestLayer } from "./lifecycle/draft-store.js";
import { generatePublishScript, publishApprovedTool } from "./lifecycle/publish.js";
import { rollbackPublishedVersion } from "./lifecycle/rollback.js";
import { draftFromForms } from "./inference/from-forms.js";
import { draftFromGraphql } from "./inference/from-graphql.js";
import { draftFromOpenApi } from "./inference/from-openapi.js";
import type {
  DraftReviewAction,
  GraphQlSchemaInput,
  HtmlFormSnapshot,
  OpenApiDocument,
} from "./types.js";

export * from "./types.js";
export * from "./errors.js";
export * from "./inference/from-openapi.js";
export * from "./inference/from-graphql.js";
export * from "./inference/from-forms.js";
export * from "./lifecycle/draft-store.js";
export * from "./lifecycle/approval.js";
export * from "./lifecycle/publish.js";
export * from "./lifecycle/rollback.js";
export * from "./lifecycle/pre-ingest-gate.js";

/** Combined live layer for drafting + WORM audit. */
export const WebMcpDraftLive: Layer.Layer<DraftStoreService | AuditService> = Layer.merge(
  DraftStoreLive,
  AuditLive
);

/** Combined test layer. */
export const WebMcpDraftTestLayer: Layer.Layer<DraftStoreService | AuditService> = Layer.merge(
  DraftStoreTestLayer,
  AuditTestLayer
);

function textResult(payload: unknown): McpToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
  };
}

/**
 * Draft candidates from a structured source and persist them as pending.
 * Forced host boundary for MCP handlers uses `Effect.runPromise` over this program.
 */
export const draftCandidatesProgram = (input: {
  readonly sourceType: "openapi" | "graphql" | "forms";
  readonly openapi?: OpenApiDocument;
  readonly graphql?: GraphQlSchemaInput;
  readonly forms?: readonly HtmlFormSnapshot[];
}): Effect.Effect<
  { readonly candidates: unknown; readonly stored: number },
  never,
  DraftStoreService
> =>
  Effect.gen(function* () {
    const store = yield* DraftStoreService;
    const candidates =
      input.sourceType === "openapi"
        ? yield* draftFromOpenApi(input.openapi ?? {})
        : input.sourceType === "graphql"
          ? yield* draftFromGraphql(input.graphql ?? {})
          : yield* draftFromForms(input.forms ?? []);
    const stored = yield* store.putCandidates(candidates);
    return { candidates: stored, stored: stored.length };
  });

const draftSchema = {
  type: "object",
  properties: {
    sourceType: { type: "string", enum: ["openapi", "graphql", "forms"] },
    openapi: { type: "object", description: "OpenAPI document object" },
    graphql: { type: "object", description: "GraphQL schema input (sdl or mutations[])" },
    forms: {
      type: "array",
      items: { type: "object" },
      description: "HTML form snapshots",
    },
  },
  required: ["sourceType"],
  additionalProperties: false,
} as const;

const reviewSchema = {
  type: "object",
  properties: {
    candidateId: { type: "string" },
    action: { type: "string", enum: ["approve", "reject", "edit-and-approve"] },
    editedTool: { type: "object" },
    reviewedBy: { type: "string" },
  },
  required: ["candidateId", "action", "reviewedBy"],
  additionalProperties: false,
} as const;

const publishSchema = {
  type: "object",
  properties: {
    publishedBy: { type: "string" },
    candidateIds: { type: "array", items: { type: "string" } },
  },
  required: ["publishedBy"],
  additionalProperties: false,
} as const;

const rollbackSchema = {
  type: "object",
  properties: {
    versionId: { type: "string" },
    publishedBy: { type: "string" },
  },
  required: ["versionId", "publishedBy"],
  additionalProperties: false,
} as const;

function asRecord(args: unknown): Record<string, unknown> {
  return args && typeof args === "object" ? (args as Record<string, unknown>) : {};
}

/**
 * Provider plugin: draft → review → publish → rollback for WebMCP tools.
 * Stub: heuristic inference only; execute binding returns stub JSON until source-adapter wiring lands.
 */
export const WebMcpDraftPlugin: Plugin = {
  id: "clawql-webmcp-draft",
  version: "0.1.0",
  vertical: "webmcp",
  onRegister: (
    api: ClawQLPluginRegistrationApi
  ): Effect.Effect<void, ClawQLError | McpToolAlreadyRegisteredError> =>
    Effect.gen(function* () {
      yield* api.registerMcpTool({
        name: "webmcp_draft",
        description:
          "Draft WebMCP tool candidates from OpenAPI, GraphQL, or HTML forms (heuristic stub).",
        schema: { ...draftSchema },
        handler: async (args: unknown) => {
          const a = asRecord(args);
          const program = draftCandidatesProgram({
            sourceType: a.sourceType as "openapi" | "graphql" | "forms",
            openapi: a.openapi as OpenApiDocument | undefined,
            graphql: a.graphql as GraphQlSchemaInput | undefined,
            forms: a.forms as HtmlFormSnapshot[] | undefined,
          }).pipe(Effect.provide(WebMcpDraftLive));
          return textResult(await Effect.runPromise(program));
        },
      });

      yield* api.registerMcpTool({
        name: "webmcp_draft_review",
        description: "Approve, reject, or edit-and-approve a WebMCP draft candidate.",
        schema: { ...reviewSchema },
        handler: async (args: unknown) => {
          const a = asRecord(args);
          const action: DraftReviewAction = {
            candidateId: String(a.candidateId ?? ""),
            action: a.action as DraftReviewAction["action"],
            editedTool: a.editedTool as DraftReviewAction["editedTool"],
            reviewedBy: String(a.reviewedBy ?? "anonymous"),
          };
          const program = reviewDraft(action).pipe(Effect.provide(WebMcpDraftLive));
          return textResult(await Effect.runPromise(program));
        },
      });

      yield* api.registerMcpTool({
        name: "webmcp_draft_publish",
        description:
          "Publish approved drafts as an immutable WebMCP version and return a registerTool script.",
        schema: { ...publishSchema },
        handler: async (args: unknown) => {
          const a = asRecord(args);
          const program = Effect.gen(function* () {
            const version = yield* publishApprovedTool({
              publishedBy: String(a.publishedBy ?? "anonymous"),
              candidateIds: a.candidateIds as string[] | undefined,
            });
            const script = yield* generatePublishScript(version);
            return { version, script };
          }).pipe(Effect.provide(WebMcpDraftLive));
          return textResult(await Effect.runPromise(program));
        },
      });

      yield* api.registerMcpTool({
        name: "webmcp_draft_rollback",
        description:
          "Rollback to a prior published WebMCP version by appending a new immutable reactivation.",
        schema: { ...rollbackSchema },
        handler: async (args: unknown) => {
          const a = asRecord(args);
          const program = rollbackPublishedVersion({
            versionId: String(a.versionId ?? ""),
            publishedBy: String(a.publishedBy ?? "anonymous"),
          }).pipe(Effect.provide(WebMcpDraftLive));
          return textResult(await Effect.runPromise(program));
        },
      });
    }),
};
