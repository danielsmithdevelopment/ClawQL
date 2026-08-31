import { Effect } from "effect";
import { AuditService } from "../../../audit/audit-service.js";
import { WebMcpPublishVersionNotFoundError } from "../errors.js";
import type { PublishedWebMcpVersion } from "../types.js";
import { DraftStoreService } from "./draft-store.js";

/**
 * Rollback means activating a prior published version by appending a new immutable
 * version that re-publishes that version's tools — never deleting history.
 */
export const rollbackPublishedVersion = (input: {
  readonly versionId: string;
  readonly publishedBy: string;
}): Effect.Effect<
  PublishedWebMcpVersion,
  WebMcpPublishVersionNotFoundError,
  DraftStoreService | AuditService
> =>
  Effect.gen(function* () {
    const store = yield* DraftStoreService;
    const audit = yield* AuditService;
    const version = yield* store.rollbackToVersion(input);
    yield* audit.append({
      category: "webmcp-draft",
      action: "WEBMCP_DRAFT_ROLLBACK",
      summary: `Rollback to ${input.versionId} → active ${version.versionId}`,
      correlationId: version.versionId,
    });
    return version;
  });
