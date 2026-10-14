import { Effect } from "effect";
import { beforeEach, describe, expect, it } from "vitest";

import { listManagedAutomationsEffect } from "./automations";
import { listManagedAuditEffect } from "./audit";
import { listManagedGatewayEffect } from "./gateway";
import {
  eraseManagedMemorySubjectEffect,
  listManagedMemoryUploadsEffect,
  resetManagedMemoryEraseEffect,
} from "./memory";
import { getManagedSettingsEffect } from "./settings";

describe("managed ops surfaces", () => {
  beforeEach(async () => {
    await Effect.runPromise(resetManagedMemoryEraseEffect());
  });

  it("lists gateway endpoints and routes", async () => {
    const gateway = await Effect.runPromise(listManagedGatewayEffect());
    expect(gateway.endpoints.some((e) => e.path === "/v1")).toBe(true);
    expect(gateway.routes.some((r) => r.id === "standard")).toBe(true);
  });

  it("lists automations, audit, and settings", async () => {
    const automations = await Effect.runPromise(listManagedAutomationsEffect());
    expect(automations.automations.some((a) => a.id === "sec_slack")).toBe(true);
    const audit = await Effect.runPromise(listManagedAuditEffect());
    expect(audit.incident.incidentId).toBe("inc_1005_01");
    expect(audit.entries.length).toBeGreaterThan(0);
    const settings = await Effect.runPromise(getManagedSettingsEffect());
    expect(settings.org.name).toMatch(/Acme/);
    expect(settings.webhookHosts.length).toBeGreaterThan(0);
  });

  it("lists memory uploads and erases a subject with acceptance", async () => {
    const uploads = await Effect.runPromise(listManagedMemoryUploadsEffect());
    expect(uploads.uploads.some((u) => u.id === "up_nw")).toBe(true);
    const erased = await Effect.runPromise(
      eraseManagedMemorySubjectEffect({
        subject: "Jane Okafor",
        acceptIrreversible: true,
        acceptAuditKept: true,
      }),
    );
    expect(erased.ok).toBe(true);
    const after = await Effect.runPromise(listManagedMemoryUploadsEffect());
    expect(after.erasedSubjects).toContain("Jane Okafor");
  });
});
