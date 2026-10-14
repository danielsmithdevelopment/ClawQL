import { Effect } from "effect";
import { beforeEach, describe, expect, it } from "vitest";

import { FIXTURE_SESSION } from "../../domain/fixtures";
import {
  listReviewEffect,
  listWorkflowRunsEffect,
  resetFixtureStateEffect,
} from "../api";
import {
  parseVoiceCommandEffect,
  runVoiceCommandEffect,
} from "../voice-assistant";

describe("voice assistant", () => {
  beforeEach(async () => {
    await Effect.runPromise(resetFixtureStateEffect());
    await Effect.runPromise(listReviewEffect(FIXTURE_SESSION));
  });

  it("parses list / read / decline / approve / ask / workflow / help", async () => {
    expect((await Effect.runPromise(parseVoiceCommandEffect("list pending"))).kind).toBe(
      "list_pending"
    );
    expect((await Effect.runPromise(parseVoiceCommandEffect("read next"))).kind).toBe(
      "read_next"
    );
    expect((await Effect.runPromise(parseVoiceCommandEffect("decline first"))).kind).toBe(
      "decline_first"
    );
    expect((await Effect.runPromise(parseVoiceCommandEffect("approve first"))).kind).toBe(
      "approve_intent"
    );
    expect((await Effect.runPromise(parseVoiceCommandEffect("ask dana"))).kind).toBe(
      "ask_teammate"
    );
    expect((await Effect.runPromise(parseVoiceCommandEffect("ask dana"))).teammateName).toBe(
      "Dana Reyes"
    );
    expect((await Effect.runPromise(parseVoiceCommandEffect("list workflows"))).kind).toBe(
      "list_workflows"
    );
    expect(
      (await Effect.runPromise(parseVoiceCommandEffect("start standup digest"))).kind
    ).toBe("start_workflow");
    expect(
      (await Effect.runPromise(parseVoiceCommandEffect("start standup digest"))).workflowId
    ).toBe("standup-digest");
    expect((await Effect.runPromise(parseVoiceCommandEffect("help"))).kind).toBe("help");
  });

  it("lists pending and refuses silent approve", async () => {
    const listed = await Effect.runPromise(
      runVoiceCommandEffect({
        session: FIXTURE_SESSION,
        utterance: "list pending",
        speak: false,
      })
    );
    expect(listed.pendingCount).toBeGreaterThan(0);
    expect(listed.spoken.toLowerCase()).toMatch(/pending/);

    const approve = await Effect.runPromise(
      runVoiceCommandEffect({
        session: FIXTURE_SESSION,
        utterance: "approve first",
        speak: false,
      })
    );
    expect(approve.command.kind).toBe("approve_intent");
    expect(approve.spoken.toLowerCase()).toMatch(/security key|face id/);
    expect(approve.navigateTo).toMatch(/^\/review\//);
  });

  it("asks a teammate about the first pending request", async () => {
    const before = await Effect.runPromise(listReviewEffect(FIXTURE_SESSION));
    const firstId = before.items[0]?.id;
    expect(firstId).toBeTruthy();
    const asked = await Effect.runPromise(
      runVoiceCommandEffect({
        session: FIXTURE_SESSION,
        utterance: "ask dana",
        speak: false,
      })
    );
    expect(asked.askedTeammate).toBe("Dana Reyes");
    const after = await Effect.runPromise(listReviewEffect(FIXTURE_SESSION));
    expect(after.items.some((i) => i.id === firstId)).toBe(false);
  });

  it("starts a fixture workflow by voice", async () => {
    const started = await Effect.runPromise(
      runVoiceCommandEffect({
        session: FIXTURE_SESSION,
        utterance: "start standup digest",
        speak: false,
      })
    );
    expect(started.startedWorkflowId).toBe("standup-digest");
    expect(started.navigateTo).toBe("/workflows");
    const runs = await Effect.runPromise(listWorkflowRunsEffect(FIXTURE_SESSION));
    expect(runs.some((r) => r.workflowId === "standup-digest")).toBe(true);
  });

  it("declines the first pending request", async () => {
    const before = await Effect.runPromise(listReviewEffect(FIXTURE_SESSION));
    const firstId = before.items[0]?.id;
    expect(firstId).toBeTruthy();
    const declined = await Effect.runPromise(
      runVoiceCommandEffect({
        session: FIXTURE_SESSION,
        utterance: "decline first",
        speak: false,
      })
    );
    expect(declined.declinedId).toBe(firstId);
    const after = await Effect.runPromise(listReviewEffect(FIXTURE_SESSION));
    expect(after.items.some((i) => i.id === firstId)).toBe(false);
  });
});
