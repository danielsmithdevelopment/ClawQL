import { Effect } from "effect";
import { ClawQLError } from "../../../errors/clawql-error.js";
import type { HookContext, HookResult, LifecycleHook } from "../../../plugin/provider-types.js";
import type { ProposedWebMcpTool } from "../types.js";
import { DraftStoreLive, DraftStoreService } from "./draft-store.js";

/**
 * Predicate: only approved/published draft tool names may be declared.
 * This is the **handler body** — composition is via {@link webMcpDraftPreIngestHook}
 * registered on `HookRegistry` and fired with core `fireHooksForEvent`.
 */
export const preIngestGate = (
  tool: ProposedWebMcpTool
): Effect.Effect<void, ClawQLError, DraftStoreService> =>
  Effect.gen(function* () {
    const store = yield* DraftStoreService;
    const all = yield* store.listCandidates();
    const allowed = all.some(
      (c) =>
        (c.status === "approved" || c.status === "published") &&
        (c.editedTool?.name ?? c.proposedTool.name) === tool.name
    );
    if (!allowed) {
      return yield* Effect.fail(
        new ClawQLError({
          reason: `webmcp-draft pre-ingest blocked undeclared tool "${tool.name}"`,
        })
      );
    }
  });

function toolFromHookContext(ctx: HookContext): ProposedWebMcpTool | null {
  const payload = ctx.payload;
  if (!payload || typeof payload !== "object") return null;
  const p = payload as Partial<ProposedWebMcpTool>;
  if (typeof p.name !== "string" || !p.name) return null;
  return {
    name: p.name,
    description: typeof p.description === "string" ? p.description : p.name,
    inputSchema:
      p.inputSchema && typeof p.inputSchema === "object"
        ? p.inputSchema
        : { type: "object", properties: {} },
  };
}

/**
 * Core `LifecycleHook` for event `pre-ingest` (session scope).
 * Closes over `DraftStoreLive` so the handler's R stays `HookRuntimeServices` (WormAuditSink).
 */
export const webMcpDraftPreIngestHook: LifecycleHook = {
  id: "webmcp-draft-declare-allowlist",
  scope: "session",
  event: "pre-ingest",
  blocking: true,
  handler: (ctx: HookContext): Effect.Effect<HookResult, ClawQLError> =>
    Effect.gen(function* () {
      const tool = toolFromHookContext(ctx);
      if (!tool) {
        return {
          allow: false,
          denyReason: "webmcp-draft pre-ingest requires payload with tool name",
        } satisfies HookResult;
      }
      const gated = yield* preIngestGate(tool).pipe(
        Effect.provide(DraftStoreLive),
        Effect.either
      );
      if (gated._tag === "Left") {
        return {
          allow: false,
          denyReason: gated.left.reason,
        } satisfies HookResult;
      }
      return { allow: true } satisfies HookResult;
    }),
};
