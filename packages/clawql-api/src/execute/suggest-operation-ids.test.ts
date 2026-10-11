import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import {
  suggestClosestOperationIds,
  suggestClosestOperationIdsEffect,
  unknownOperationIdErrorEffect,
} from "./suggest-operation-ids.js";

const catalog = [
  "github.pulls.get",
  "github.pulls.list",
  "github.issues.create",
  "slack.chat.postMessage",
  "run.projects.locations.services.get",
];

describe("suggestClosestOperationIds", () => {
  it("suggests near matches for typos", () => {
    const hits = suggestClosestOperationIds("github.pulls.gett", catalog, 3);
    expect(hits[0]).toBe("github.pulls.get");
    expect(hits).toContain("github.pulls.list");
  });

  it("unknownOperationIdErrorEffect includes fix + suggestions", async () => {
    const body = await Effect.runPromise(
      unknownOperationIdErrorEffect("github.pulls.gett", catalog)
    );
    expect(String(body.error)).toContain("Unknown operationId");
    expect(body.suggestions).toEqual(expect.arrayContaining(["github.pulls.get"]));
    expect(String(body.fix)).toMatch(/Did you mean|search/i);
  });

  it("Effect API matches sync façade", async () => {
    const fromEffect = await Effect.runPromise(
      suggestClosestOperationIdsEffect("slack.chat.post", catalog, 2)
    );
    expect(fromEffect).toEqual(suggestClosestOperationIds("slack.chat.post", catalog, 2));
    expect(fromEffect[0]).toBe("slack.chat.postMessage");
  });
});
