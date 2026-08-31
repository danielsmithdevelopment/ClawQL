import { Effect } from "effect";
import { ClawQLError } from "../../../errors/clawql-error.js";
import type { ProposedWebMcpTool } from "../types.js";
import { DraftStoreService } from "./draft-store.js";

/**
 * Stub `pre-ingest` gate: approved/published drafts may only declare tools that
 * match a stored candidate (by name). Hook wiring into the full ProviderPlugin
 * pre-ingest surface lands when that API is composed in clawql-api.
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
