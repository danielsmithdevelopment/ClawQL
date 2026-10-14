import { getOrgUnifiedSpendSummaryEffect } from "clawql-payments";
import { Effect, Ref } from "effect";

import {
  managedOrgId,
  managedTenantId,
  readManagedDataSource,
  resolveWithFallbackEffect,
} from "@/lib/managed/data-source";
import {
  TEAM_APPROVERS,
  TEAM_GROUPS,
  TEAM_PEOPLE,
  TEAM_ROLES,
} from "@/lib/managed/fixtures-ops";

export type ManagedTeamPerson = {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly role: string;
  readonly groups: readonly string[];
  readonly canApprove: boolean;
  readonly keysReady: boolean;
  readonly lastActive: string;
  readonly invitePending?: boolean;
  readonly canApproveSummary?: string;
  readonly keysLabel?: string;
};

export type ManagedTeamInviteInput = {
  readonly email: string;
  readonly name?: string;
  readonly role?: string;
  readonly acceptCanApprove?: boolean;
  readonly acceptSecurityKeys?: boolean;
  readonly acceptAuditRecorded?: boolean;
};

const invitesRef = Ref.makeUnsafe<ManagedTeamPerson[]>([]);

function mapFixturePerson(person: (typeof TEAM_PEOPLE)[number]): ManagedTeamPerson {
  const groups = person.groups.split(",").map((g) => g.trim()).filter(Boolean);
  return {
    id: person.id,
    name: person.name,
    email: person.email,
    role: person.role,
    groups,
    canApprove: person.canApprove !== "Nothing",
    keysReady: person.keysTone === "ok",
    lastActive: person.lastActive,
    invitePending: person.keysTone === "neutral",
    canApproveSummary: person.canApprove,
    keysLabel: person.keys,
  };
}

function fixturePeopleWithInvites(
  invites: readonly ManagedTeamPerson[],
): ManagedTeamPerson[] {
  const base = TEAM_PEOPLE.map(mapFixturePerson);
  const seen = new Set(base.map((p) => p.email.toLowerCase()));
  const extra = invites.filter((p) => !seen.has(p.email.toLowerCase()));
  return [...base, ...extra];
}

export const listManagedTeamEffect = (
  env: NodeJS.ProcessEnv = process.env,
): Effect.Effect<{
  readonly people: readonly ManagedTeamPerson[];
  readonly groups: typeof TEAM_GROUPS;
  readonly roles: typeof TEAM_ROLES;
  readonly approvers: typeof TEAM_APPROVERS;
  readonly source: "live" | "fixture";
}> =>
  Effect.gen(function* () {
    const invites = yield* Ref.get(invitesRef);
    const fixturePeople = fixturePeopleWithInvites(invites);

    const resolved = yield* resolveWithFallbackEffect({
      source: readManagedDataSource(env),
      fixture: fixturePeople,
      isLiveUseful: (people) => people.length > 0 && people[0]?.id.startsWith("member_") === true,
      live: Effect.gen(function* () {
        const orgId = managedOrgId(env);
        if (!orgId) {
          return yield* Effect.fail(new Error("CLAWQL_MANAGED_ORG_ID required for live team"));
        }
        const summary = yield* getOrgUnifiedSpendSummaryEffect({
          orgId,
          actorTenantId: managedTenantId(env),
          includeWormSpend: false,
        });
        if (summary.members.length === 0) {
          return yield* Effect.fail(new Error("no org members"));
        }
        return summary.members.map((m) => {
          const email = m.email?.trim() || `${m.memberTenantId}@org.local`;
          const name = m.displayName?.trim() || email;
          return {
            id: `member_${m.memberTenantId}`,
            name,
            email,
            role: "Member",
            groups: ["Org"],
            canApprove: false,
            keysReady: false,
            lastActive: "Live org member",
            canApproveSummary: "From org spend roster",
            keysLabel: "Managed via IdP",
          } satisfies ManagedTeamPerson;
        });
      }),
    });

    return {
      people: resolved.data,
      groups: TEAM_GROUPS,
      roles: TEAM_ROLES,
      approvers: TEAM_APPROVERS,
      source: resolved.source,
    };
  });

export const inviteManagedTeamPersonEffect = (
  input: ManagedTeamInviteInput,
): Effect.Effect<{ readonly person: ManagedTeamPerson; readonly source: "fixture" }, Error> =>
  Effect.gen(function* () {
    const email = input.email.trim().toLowerCase();
    if (!email || !email.includes("@")) {
      return yield* Effect.fail(new Error("valid email required"));
    }
    if (!input.acceptCanApprove || !input.acceptSecurityKeys || !input.acceptAuditRecorded) {
      return yield* Effect.fail(
        new Error("acceptCanApprove, acceptSecurityKeys, and acceptAuditRecorded are required"),
      );
    }
    const existing = yield* listManagedTeamEffect({
      ...process.env,
      CLAWQL_MANAGED_DATA_SOURCE: "fixture",
    });

    if (existing.people.some((p) => p.email.toLowerCase() === email)) {
      return yield* Effect.fail(new Error("already_invited"));
    }
    const local = email.split("@")[0] || "invitee";
    const person: ManagedTeamPerson = {
      id: `invite_${Date.now().toString(36)}`,
      name: (input.name ?? local).trim() || local,
      email,
      role: (input.role ?? "Member").trim() || "Member",
      groups: ["Invited"],
      canApprove: false,
      keysReady: false,
      lastActive: "Invite sent",
      invitePending: true,
      canApproveSummary: "Nothing yet",
      keysLabel: "Invite sent, expires in 7 days",
    };
    yield* Ref.update(invitesRef, (rows) => [...rows, person]);
    return { person, source: "fixture" as const };
  });

export const resetManagedTeamInvitesEffect = (): Effect.Effect<void> =>
  Ref.set(invitesRef, []);
