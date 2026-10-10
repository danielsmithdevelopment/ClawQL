/**
 * End-to-end acceptance — must pass 3/3 against real witnesses before recording.
 * Day-1: skipped until Artifacts + deploy are wired. Do not satisfy with mocks.
 */

import { describe, it } from "vitest";

const live = process.env.ATTEMPTS_E2E === "1";

describe.skipIf(!live)("demo-run (live witnesses)", () => {
  it("seeds task, three notes, one blocked, merge, arweave verify, canary", async () => {
    // 1. Seed demo task against demo/webhooks-service
    // 2. Three agents/replays push
    // 3. Assert three hash-chained notes; att_3 blocked
    // 4. Decider → approve via POST if needed
    // 5. Main contains winner
    // 6. artifacts-verify <arweave-id>
    // 7. Canary at manifest policy.canaryPercent
    throw new Error("not wired — enable ATTEMPTS_E2E=1 after Day 4 deploy");
  });
});
