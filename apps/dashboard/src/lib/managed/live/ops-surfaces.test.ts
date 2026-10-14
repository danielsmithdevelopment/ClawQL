import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Effect } from "effect";
import { describe, expect, it } from "vitest";

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

  it("durably erases a memory subject under CLAWQL_HOME", async () => {
    const home = mkdtempSync(join(tmpdir(), "clawql-erase-"));
    const env = { ...process.env, CLAWQL_HOME: home };
    await Effect.runPromise(resetManagedMemoryEraseEffect(env));
    const uploads = await Effect.runPromise(listManagedMemoryUploadsEffect(env));
    expect(uploads.uploads.some((u) => u.id === "up_nw")).toBe(true);
    expect(uploads.erasurePreview.subject).toBe("Jane Okafor");
    const erased = await Effect.runPromise(
      eraseManagedMemorySubjectEffect({
        subject: "Jane Okafor",
        acceptIrreversible: true,
        acceptAuditKept: true,
        env,
      }),
    );
    expect(erased.ok).toBe(true);
    expect(erased.jobId).toMatch(/^era_/);
    const after = await Effect.runPromise(listManagedMemoryUploadsEffect(env));
    expect(after.erasedSubjects).toContain("Jane Okafor");
  });
});
