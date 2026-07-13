import { describe, expect, it } from "vitest";
import { handleScheduleToolInput } from "../schedule/schedule.js";

describe("automation error propagation", () => {
  it("rethrows Zod validation errors from schedule create", async () => {
    process.env.CLAWQL_SCHEDULE_INTERVAL_MIN_SECONDS = "300";
    await expect(
      handleScheduleToolInput({
        operation: "create",
        schedule: { frequency: { type: "interval", seconds: 10 } },
        action: {
          kind: "synthetic",
          synthetic_test: {
            name: "bad",
            request: { method: "GET", url: "https://example.com" },
          },
        },
      })
    ).rejects.toThrow(/interval seconds/i);
  });
});
