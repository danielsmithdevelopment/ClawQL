import { Effect } from "effect";
import { afterEach, describe, expect, it } from "vitest";
import { automationServicesLiveLayer } from "./automation-effect-runtime.js";
import { executeNotifySlackCoreEffect } from "./notify-slack-effect.js";
import { executeNotifySlackEffect } from "./automation-tools-effect.js";
import { reshapeSlackExecuteResult, resetNotifyDepsForTests } from "../notify/notify.js";

describe("executeNotifySlackEffect", () => {
  it("returns soft error when Slack token is missing", async () => {
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

describe("executeNotifySlackCoreEffect", () => {
  const prevToken = process.env.CLAWQL_SLACK_TOKEN;

  afterEach(() => {
    resetNotifyDepsForTests();
    if (prevToken === undefined) delete process.env.CLAWQL_SLACK_TOKEN;
    else process.env.CLAWQL_SLACK_TOKEN = prevToken;
    delete process.env.SLACK_BOT_TOKEN;
    delete process.env.SLACK_TOKEN;
    delete process.env.CLAWQL_SLACK_BOT_TOKEN;
  });

  it("stages prelude channel/text validation without nested Layer provision", async () => {
    process.env.CLAWQL_SLACK_TOKEN = "xoxb-test";
    const result = await Effect.runPromise(
      executeNotifySlackCoreEffect({ channel: "  ", text: "hi" })
    );
    const body = JSON.parse(result.content[0]!.text) as { error?: string };
    expect(body.error).toMatch(/channel.*text.*required/i);
  });
});

describe("reshapeSlackExecuteResult", () => {
  it("maps Slack ok:false to notify error payload", () => {
    const reshaped = reshapeSlackExecuteResult({
      content: [
        { type: "text" as const, text: JSON.stringify({ ok: false, error: "channel_not_found" }) },
      ],
    });
    const body = JSON.parse(reshaped.content[0]!.text) as {
      error?: string;
      slack?: { ok: boolean };
    };
    expect(body.error).toBe("channel_not_found");
    expect(body.slack?.ok).toBe(false);
  });

  it("passes through successful execute bodies", () => {
    const exec = {
      content: [{ type: "text" as const, text: JSON.stringify({ ok: true, ts: "1.2" }) }],
    };
    expect(reshapeSlackExecuteResult(exec)).toEqual(exec);
  });
});
