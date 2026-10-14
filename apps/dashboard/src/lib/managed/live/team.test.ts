import { Effect } from "effect";
import { beforeEach, describe, expect, it } from "vitest";

import {
  inviteManagedTeamPersonEffect,
  listManagedTeamEffect,
  resetManagedTeamInvitesEffect,
} from "./team";

describe("managed team live layer", () => {
  beforeEach(async () => {
    await Effect.runPromise(resetManagedTeamInvitesEffect());
  });

  it("lists fixture people, groups, and roles", async () => {
    const listed = await Effect.runPromise(
      listManagedTeamEffect({ ...process.env, CLAWQL_MANAGED_DATA_SOURCE: "fixture" }),
    );
    expect(listed.source).toBe("fixture");
    expect(listed.people.some((p) => p.id === "dana")).toBe(true);
    expect(listed.groups.length).toBeGreaterThan(0);
    expect(listed.roles.some((r) => r.id === "admin")).toBe(true);
  });

  it("falls back to fixture when live org spend has no useful members", async () => {
    const listed = await Effect.runPromise(
      listManagedTeamEffect({
        ...process.env,
        CLAWQL_MANAGED_DATA_SOURCE: "live",
        CLAWQL_MANAGED_ORG_ID: "",
      }),
    );
    expect(listed.source).toBe("fixture");
    expect(listed.people.some((p) => p.id === "dana")).toBe(true);
  });

  it("requires acceptance checkboxes before invite", async () => {
    const exit = await Effect.runPromiseExit(
      inviteManagedTeamPersonEffect({
        email: "new@acme.example",
        acceptCanApprove: true,
        acceptSecurityKeys: false,
        acceptAuditRecorded: true,
      }),
    );
    expect(exit._tag).toBe("Failure");
  });

  it("invites a person once acceptance is complete", async () => {
    const invited = await Effect.runPromise(
      inviteManagedTeamPersonEffect({
        email: "alex@acme.example",
        name: "Alex Rivera",
        role: "Member",
        acceptCanApprove: true,
        acceptSecurityKeys: true,
        acceptAuditRecorded: true,
      }),
    );
    expect(invited.person.email).toBe("alex@acme.example");
    expect(invited.person.invitePending).toBe(true);
    const listed = await Effect.runPromise(
      listManagedTeamEffect({ ...process.env, CLAWQL_MANAGED_DATA_SOURCE: "fixture" }),
    );
    expect(listed.people.some((p) => p.email === "alex@acme.example")).toBe(true);
  });
});
