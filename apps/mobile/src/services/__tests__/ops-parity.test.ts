import { Effect } from "effect";
import { beforeEach, describe, expect, it } from "vitest";

import { FIXTURE_SESSION } from "../../domain/fixtures";
import {
  clearPushDevicesEffect,
  eraseMemorySubjectEffect,
  getGatewayBundleEffect,
  getOrgSettingsBundleEffect,
  listAutomationsEffect,
  listAuditEntriesEffect,
  listMemoryUploadsEffect,
  listPushDevicesEffect,
  openBillingPortalEffect,
  registerPushDeviceEffect,
  resetFixtureStateEffect,
} from "../api";

describe("ops parity gateway/automations/audit/settings/memory erase", () => {
  beforeEach(async () => {
    await Effect.runPromise(resetFixtureStateEffect());
  });

  it("loads gateway routes and endpoints", async () => {
    const gateway = await Effect.runPromise(getGatewayBundleEffect(FIXTURE_SESSION));
    expect(gateway.routes.some((r) => r.id === "standard")).toBe(true);
    expect(gateway.endpoints.some((e) => e.path === "/v1")).toBe(true);
  });

  it("lists automations, audit, and settings", async () => {
    const automations = await Effect.runPromise(listAutomationsEffect(FIXTURE_SESSION));
    expect(automations.some((a) => a.id === "sec_slack")).toBe(true);
    const audit = await Effect.runPromise(listAuditEntriesEffect(FIXTURE_SESSION));
    expect(audit.length).toBeGreaterThan(0);
    const settings = await Effect.runPromise(getOrgSettingsBundleEffect(FIXTURE_SESSION));
    expect(settings.org.name).toMatch(/Acme/);
  });

  it("lists memory uploads and erases a subject", async () => {
    const before = await Effect.runPromise(listMemoryUploadsEffect(FIXTURE_SESSION));
    expect(before.uploads.some((u) => u.id === "up_nw")).toBe(true);
    const erased = await Effect.runPromise(
      eraseMemorySubjectEffect({
        session: FIXTURE_SESSION,
        subject: "Jane Okafor",
        acceptIrreversible: true,
        acceptAuditKept: true,
      })
    );
    expect(erased.ok).toBe(true);
    expect(erased.jobId).toMatch(/^era_/);
    const after = await Effect.runPromise(listMemoryUploadsEffect(FIXTURE_SESSION));
    expect(after.erasedSubjects).toContain("Jane Okafor");
  });

  it("returns fixture billing portal honesty URL", async () => {
    const portal = await Effect.runPromise(openBillingPortalEffect(FIXTURE_SESSION));
    expect(portal.source).toBe("fixture");
    expect(portal.url).toContain("fixture://");
  });

  it("registers and clears fixture push devices locally", async () => {
    await Effect.runPromise(
      registerPushDeviceEffect({
        session: FIXTURE_SESSION,
        token: "ExponentPushToken[ops-parity]",
        platform: "ios",
        label: "Ops parity phone",
        fixture: true,
      })
    );
    const listed = await Effect.runPromise(listPushDevicesEffect(FIXTURE_SESSION));
    expect(listed.some((d) => d.token.includes("ops-parity"))).toBe(true);
    await Effect.runPromise(clearPushDevicesEffect(FIXTURE_SESSION));
    const after = await Effect.runPromise(listPushDevicesEffect(FIXTURE_SESSION));
    expect(after).toHaveLength(0);
  });
});
