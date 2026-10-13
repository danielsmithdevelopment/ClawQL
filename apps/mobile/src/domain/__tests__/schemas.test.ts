import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import { FIXTURE_REVIEW_ITEMS, FIXTURE_SESSION } from "../fixtures";
import {
  DocumentAttachment,
  PushDevice,
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
    expect(decoded.items.find((i) => i.id === "rev_skill")?.kind).toBe("skill");
    const change = decoded.items.find((i) => i.id === "rev_change");
    expect(change?.exactChange?.[1]?.after).toBe("$52,000.00");
    const decision = decoded.items.find((i) => i.id === "rev_decision");
    expect(decision?.decisionChoices?.[0]?.label).toBe("Billing question");
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

  it("decodes push device and document attachment", async () => {
    const device = await Effect.runPromise(
      decodeUnknownEffect(PushDevice, {
        id: "push_ios_fixture",
        token: "ExponentPushToken[fixture-abc]",
        platform: "ios",
        label: "This phone (fixture)",
        registeredAtMs: 1_700_000_000_000,
        fixture: true,
      })
    );
    expect(device.fixture).toBe(true);
    const doc = await Effect.runPromise(
      decodeUnknownEffect(DocumentAttachment, {
        id: "doc_1",
        reviewId: "rev_change",
        uri: "fixture://document/doc_1.jpg",
        fileName: "scan-doc.jpg",
        mimeType: "image/jpeg",
        source: "camera",
        capturedAtMs: 1_700_000_000_000,
        bytes: 48_120,
      })
    );
    expect(doc.source).toBe("camera");
  });
});
