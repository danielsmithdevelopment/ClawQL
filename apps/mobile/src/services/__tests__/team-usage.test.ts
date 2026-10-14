import { Effect } from "effect";
import { beforeEach, describe, expect, it } from "vitest";

import { FIXTURE_SESSION } from "../../domain/fixtures";
import {
  getManagedUsageEffect,
  getTeamBundleEffect,
  inviteTeammateEffect,
  listTeammatesEffect,
  resetFixtureStateEffect,
} from "../api";

describe("team invite + managed usage", () => {
  beforeEach(async () => {
    await Effect.runPromise(resetFixtureStateEffect());
  });

  it("loads team people, roles, and groups", async () => {
    const bundle = await Effect.runPromise(getTeamBundleEffect(FIXTURE_SESSION));
    expect(bundle.people.some((p) => p.email === "dana@acme.example")).toBe(true);
    expect(bundle.roles.some((r) => r.id === "admin")).toBe(true);
    expect(bundle.groups.some((g) => g.id === "engineering")).toBe(true);
  });

  it("requires acceptance checkboxes before invite", async () => {
    const exit = await Effect.runPromiseExit(
      inviteTeammateEffect({
        session: FIXTURE_SESSION,
        email: "new@acme.example",
        acceptCanApprove: true,
        acceptSecurityKeys: false,
        acceptAuditRecorded: true,
      })
    );
    expect(exit._tag).toBe("Failure");
  });

  it("invites a teammate after acceptance checks", async () => {
    const person = await Effect.runPromise(
      inviteTeammateEffect({
        session: FIXTURE_SESSION,
        email: "alex@acme.example",
        name: "Alex Rivera",
        role: "Member",
        acceptCanApprove: true,
        acceptSecurityKeys: true,
        acceptAuditRecorded: true,
      })
    );
    expect(person.invitePending).toBe(true);
    const people = await Effect.runPromise(listTeammatesEffect(FIXTURE_SESSION));
    expect(people.some((p) => p.email === "alex@acme.example")).toBe(true);
  });

  it("loads managed usage month and team rows", async () => {
    const usage = await Effect.runPromise(getManagedUsageEffect(FIXTURE_SESSION));
    expect(usage.monthSpent).toBeGreaterThan(0);
    expect(usage.teamRows.some((r) => r.team === "documents")).toBe(true);
    expect(usage.source).toBe("fixture");
  });
});
