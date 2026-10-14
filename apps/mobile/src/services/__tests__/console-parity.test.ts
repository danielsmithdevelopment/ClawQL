import { Effect } from "effect";
import { beforeEach, describe, expect, it } from "vitest";

import { FIXTURE_SESSION } from "../../domain/fixtures";
import {
  getAuditIncidentEffect,
  getOrgSettingsBundleEffect,
  listAgentSessionsEffect,
  listConnectionsEffect,
  listProposedSkillsEffect,
  resetFixtureStateEffect,
} from "../api";
import { hrefForDeepLink, parseAppDeepLinkEffect } from "../push";

describe("console parity sessions/skills/connections", () => {
  beforeEach(async () => {
    await Effect.runPromise(resetFixtureStateEffect());
  });

  it("lists agent sessions, proposed skills, and connections", async () => {
    const sessions = await Effect.runPromise(listAgentSessionsEffect(FIXTURE_SESSION));
    expect(sessions.some((s) => s.id === "sess_7f2a91c4")).toBe(true);
    const skills = await Effect.runPromise(listProposedSkillsEffect(FIXTURE_SESSION));
    expect(skills.some((s) => s.id === "contract-redline-check")).toBe(true);
    const connections = await Effect.runPromise(listConnectionsEffect(FIXTURE_SESSION));
    expect(connections.some((c) => c.id === "github" && c.accounts.length > 0)).toBe(true);
  });

  it("loads audit incident and settings network/privacy bundle", async () => {
    const incident = await Effect.runPromise(getAuditIncidentEffect(FIXTURE_SESSION));
    expect(incident.incidentId).toBe("inc_1005_01");
    const settings = await Effect.runPromise(getOrgSettingsBundleEffect(FIXTURE_SESSION));
    expect(settings.org.name).toMatch(/Acme/);
    expect(settings.webhookHosts.length).toBeGreaterThan(0);
    expect(settings.retention.some((r) => r.label === "Audit log")).toBe(true);
  });

  it("parses sessions/skills/connections deep links", async () => {
    for (const [url, href] of [
      ["clawql://sessions", "/sessions"],
      ["clawql://skills", "/skills"],
      ["clawql://connections", "/connections"],
    ] as const) {
      const target = await Effect.runPromise(parseAppDeepLinkEffect(url));
      expect(hrefForDeepLink(target!)).toBe(href);
    }
  });
});
