import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import { FIXTURE_REVIEW_ITEMS, FIXTURE_SESSION } from "../fixtures";
import {
  ReviewListResponse,
  MobileSession,
  decodeUnknownEffect,
} from "../schemas";

describe("mobile domain schemas", () => {
  it("decodes fixture review list", async () => {
    const decoded = await Effect.runPromise(
      decodeUnknownEffect(ReviewListResponse, {
        items: FIXTURE_REVIEW_ITEMS,
        source: "fixture",
      })
    );
    expect(decoded.items[0]?.id).toBe("rev_change");
    expect(decoded.items[0]?.exactChange?.[1]?.after).toBe("$52,000.00");
  });

  it("decodes session including reviewer demo flag", async () => {
    const decoded = await Effect.runPromise(
      decodeUnknownEffect(MobileSession, {
        ...FIXTURE_SESSION,
        reviewerDemo: true,
      })
    );
    expect(decoded.reviewerDemo).toBe(true);
  });
});
