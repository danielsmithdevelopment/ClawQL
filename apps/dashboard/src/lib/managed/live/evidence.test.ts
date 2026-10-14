import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import {
  addManagedEvidenceEffect,
  listManagedEvidenceEffect,
  removeManagedEvidenceEffect,
} from "./evidence";

describe("managed evidence", () => {
  it("adds, lists, and removes review attachments", async () => {
    const home = mkdtempSync(join(tmpdir(), "clawql-evidence-"));
    const env = {
      ...process.env,
      CLAWQL_MANAGED_DATA_SOURCE: "live",
      CLAWQL_HOME: home,
    };
    const attachment = {
      id: "doc_1",
      reviewId: "rev_change",
      uri: "fixture://document/doc_1.jpg",
      fileName: "scan.jpg",
      mimeType: "image/jpeg",
      source: "camera" as const,
      capturedAtMs: Date.now(),
      bytes: 1200,
    };
    await Effect.runPromise(addManagedEvidenceEffect({ attachment, env }));
    const listed = await Effect.runPromise(
      listManagedEvidenceEffect({ reviewId: "rev_change", env }),
    );
    expect(listed.attachments.some((a) => a.id === "doc_1")).toBe(true);
    await Effect.runPromise(
      removeManagedEvidenceEffect({
        reviewId: "rev_change",
        attachmentId: "doc_1",
        env,
      }),
    );
    const after = await Effect.runPromise(
      listManagedEvidenceEffect({ reviewId: "rev_change", env }),
    );
    expect(after.attachments).toHaveLength(0);
  });
});
