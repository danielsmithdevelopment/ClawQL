import { Effect } from "effect";
import { AuditService } from "../../../audit/audit-service.js";
import type { ClawQLError } from "../../../errors/clawql-error.js";
import type {
  HookRegistry,
  SecurityError,
  WormAuditSink,
} from "../../../plugin/provider-types.js";
import {
  WebMcpDraftInvalidStateError,
  WebMcpDraftNotFoundError,
} from "../errors.js";
import type { DraftReviewAction, StoredDraftCandidate } from "../types.js";
import { DraftStoreService } from "./draft-store.js";
import { publishApprovedTool } from "./publish.js";

/**
 * Review / edit / approve / reject a draft candidate.
 * Appends a WORM-style audit event via AuditService, then optionally publishes
 * (which fires core `pre-ingest` hooks via `fireHooksForEvent` before committing).
 */
export const reviewDraft = (
  action: DraftReviewAction
): Effect.Effect<
  StoredDraftCandidate,
  | WebMcpDraftNotFoundError
  | WebMcpDraftInvalidStateError
  | ClawQLError
  | SecurityError
  | Error,
  DraftStoreService | AuditService | HookRegistry | WormAuditSink
> =>
  Effect.gen(function* () {
    const store = yield* DraftStoreService;
    const audit = yield* AuditService;

    const status = action.action === "reject" ? ("rejected" as const) : ("approved" as const);
    const updated = yield* store.markReviewed({
      candidateId: action.candidateId,
      status,
      reviewedBy: action.reviewedBy,
      editedTool: action.editedTool,
    });

    yield* audit.append({
      category: "webmcp-draft",
      action: action.action === "reject" ? "WEBMCP_DRAFT_REJECTED" : "WEBMCP_DRAFT_APPROVED",
      summary: `${action.action} candidate ${action.candidateId}${action.editedTool ? " (edited)" : ""}`,
      correlationId: action.candidateId,
    });

    if (action.action !== "reject") {
      yield* publishApprovedTool({
        candidateIds: [action.candidateId],
        publishedBy: action.reviewedBy,
      });
      return yield* store.getCandidate(action.candidateId);
    }

    return updated;
  });
