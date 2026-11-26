import { join } from "node:path";

import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import {
  isManagedMultiTenantModeEffect,
  OrgHomeError,
  orgScopedHomeEffect,
  resolveDashboardManagedHomeEffect,
  resolveManagedStorePathEffect,
  sanitizeManagedOrgIdEffect,
} from "./org-home";

describe("managed org home (CC1 partition)", () => {
  it("stays single-tenant when CLAWQL_MANAGED_ORG_ID and MULTI_TENANT unset", async () => {
    const env = { CLAWQL_HOME: "/tmp/clawql-home" };
    expect(await Effect.runPromise(isManagedMultiTenantModeEffect(env))).toBe(false);
    const home = await Effect.runPromise(
      orgScopedHomeEffect({ home: "/tmp/clawql-home", orgId: "org_a", env }),
    );
    expect(home).toBe("/tmp/clawql-home");
  });

  it("partitions under orgs/<orgId> when CLAWQL_MANAGED_ORG_ID is set", async () => {
    const env = {
      CLAWQL_HOME: "/tmp/shared",
      CLAWQL_MANAGED_ORG_ID: "org_deploy",
    };
    expect(await Effect.runPromise(isManagedMultiTenantModeEffect(env))).toBe(true);
    const home = await Effect.runPromise(
      resolveDashboardManagedHomeEffect({ orgId: "org_acme", env }),
    );
    expect(home).toBe(join("/tmp/shared", "orgs", "org_acme"));
  });

  it("partitions when CLAWQL_MANAGED_MULTI_TENANT=1 without MANAGED_ORG_ID", async () => {
    const env = {
      CLAWQL_HOME: "/tmp/shared",
      CLAWQL_MANAGED_MULTI_TENANT: "1",
    };
    const a = await Effect.runPromise(
      resolveDashboardManagedHomeEffect({ orgId: "org_a", env }),
    );
    const b = await Effect.runPromise(
      resolveDashboardManagedHomeEffect({ orgId: "org_b", env }),
    );
    expect(a).toBe(join("/tmp/shared", "orgs", "org_a"));
    expect(b).toBe(join("/tmp/shared", "orgs", "org_b"));
    expect(a).not.toBe(b);
  });

  it("fails closed when multi-tenant and orgId missing", async () => {
    const env = { CLAWQL_MANAGED_MULTI_TENANT: "1", CLAWQL_HOME: "/tmp/h" };
    const err = await Effect.runPromise(
      resolveDashboardManagedHomeEffect({ orgId: "", env }).pipe(Effect.flip),
    );
    expect(err).toBeInstanceOf(OrgHomeError);
    expect(err.reason).toBe("org_required");
  });

  it("fails closed when CLAWQL_MANAGED_ORG_ID set and orgId missing", async () => {
    const env = { CLAWQL_MANAGED_ORG_ID: "org_bound", CLAWQL_HOME: "/tmp/h" };
    const err = await Effect.runPromise(
      resolveDashboardManagedHomeEffect({ orgId: null, env }).pipe(Effect.flip),
    );
    expect(err.reason).toBe("org_required");
  });

  it("rejects path-traversal org ids", async () => {
    const bad = await Effect.runPromise(
      sanitizeManagedOrgIdEffect("../etc").pipe(Effect.flip),
    );
    expect(bad.reason).toBe("org_invalid");
    const slash = await Effect.runPromise(
      sanitizeManagedOrgIdEffect("org/a").pipe(Effect.flip),
    );
    expect(slash.reason).toBe("org_invalid");
  });

  it("ignores path overrides in multi-tenant mode", async () => {
    const env = {
      CLAWQL_HOME: "/tmp/shared",
      CLAWQL_MANAGED_MULTI_TENANT: "1",
      CLAWQL_API_KEYS_PATH: "/tmp/shared-override/api-keys.json",
    };
    const path = await Effect.runPromise(
      resolveManagedStorePathEffect({
        orgId: "org_a",
        segments: ["Auth", "api-keys.json"],
        overrideEnvKey: "CLAWQL_API_KEYS_PATH",
        env,
      }),
    );
    expect(path).toBe(join("/tmp/shared", "orgs", "org_a", "Auth", "api-keys.json"));
  });

  it("honors path overrides in single-tenant mode", async () => {
    const env = {
      CLAWQL_HOME: "/tmp/home",
      CLAWQL_API_KEYS_PATH: "/tmp/custom/keys.json",
    };
    const path = await Effect.runPromise(
      resolveManagedStorePathEffect({
        orgId: "ignored",
        segments: ["Auth", "api-keys.json"],
        overrideEnvKey: "CLAWQL_API_KEYS_PATH",
        env,
      }),
    );
    expect(path).toBe("/tmp/custom/keys.json");
  });

  it("isolates store paths so org B cannot share org A's prefix", async () => {
    const env = {
      CLAWQL_HOME: "/tmp/shared",
      CLAWQL_MANAGED_MULTI_TENANT: "true",
    };
    const keysA = await Effect.runPromise(
      resolveManagedStorePathEffect({
        orgId: "org_a",
        segments: ["Auth", "api-keys.json"],
        env,
      }),
    );
    const keysB = await Effect.runPromise(
      resolveManagedStorePathEffect({
        orgId: "org_b",
        segments: ["Auth", "api-keys.json"],
        env,
      }),
    );
    const memoryA = await Effect.runPromise(
      resolveManagedStorePathEffect({
        orgId: "org_a",
        segments: ["Auth", "memory-erasure.json"],
        env,
      }),
    );
    expect(keysA).toContain(`${join("orgs", "org_a")}${join("/", "Auth")}`);
    expect(keysB).not.toContain(join("orgs", "org_a"));
    expect(memoryA.startsWith(join("/tmp/shared", "orgs", "org_a"))).toBe(true);
  });
});
