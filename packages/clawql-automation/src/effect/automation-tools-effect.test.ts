import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { automationServicesLiveLayer } from "./automation-effect-runtime.js";
import { executeNotifySlackEffect } from "./automation-tools-effect.js";

describe("executeNotifySlackEffect", () => {
  it("returns error when Slack token is missing", async () => {
    const saved = process.env.CLAWQL_SLACK_TOKEN;
    delete process.env.CLAWQL_SLACK_TOKEN;
    delete process.env.SLACK_BOT_TOKEN;
    delete process.env.SLACK_TOKEN;
    delete process.env.CLAWQL_SLACK_BOT_TOKEN;
    try {
      const result = await Effect.runPromise(
        executeNotifySlackEffect({ channel: "C1", text: "hi" }).pipe(
          Effect.provide(automationServicesLiveLayer())
        )
      );
      const body = JSON.parse(result.content[0]!.text) as { error?: string };
      expect(body.error).toMatch(/Slack bot token missing/);
    } finally {
      if (saved === undefined) delete process.env.CLAWQL_SLACK_TOKEN;
      else process.env.CLAWQL_SLACK_TOKEN = saved;
    }
  });
});
