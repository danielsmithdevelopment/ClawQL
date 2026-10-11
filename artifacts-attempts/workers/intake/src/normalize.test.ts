import { describe, expect, it } from "vitest";
import { normalizePush } from "./index.js";

describe("normalizePush", () => {
  it("maps cf.artifacts.repo.pushed to the queue message", () => {
    const msg = normalizePush({
      type: "cf.artifacts.repo.pushed",
      source: { repoName: "tsk_7f2a-att_3" },
      payload: { after: "a91f" + "0".repeat(36) },
      metadata: { eventTimestamp: "2026-10-11T14:02:11Z" },
    });
    expect(msg).toEqual({
      type: "push",
      repo: "tsk_7f2a-att_3",
      commit: "a91f" + "0".repeat(36),
      at: "2026-10-11T14:02:11Z",
    });
  });
});
