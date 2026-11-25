import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { matchesEventFiltersEffect, tenantFilterAllowsEffect } from "./subscription-match.js";

describe("tenantFilterAllowsEffect (audit 5.04 / W3)", () => {
  it("allows events without tenant", async () => {
    expect(
      await Effect.runPromise(tenantFilterAllowsEffect({}, { document_id: "d1" }))
    ).toBe(true);
  });

  it("blocks tenant-scoped events when claims tenant is missing", async () => {
    expect(
      await Effect.runPromise(
        tenantFilterAllowsEffect({ document_id: "d1" }, { document_id: "d1", tenant_id: "t-a" })
      )
    ).toBe(false);
  });

  it("ignores self-asserted filter tenant_id without claims (W3)", async () => {
    expect(
      await Effect.runPromise(
        tenantFilterAllowsEffect({ tenant_id: "t-a" }, { tenant_id: "t-a", status: "ok" })
      )
    ).toBe(false);
  });

  it("allows matching claims tenant", async () => {
    expect(
      await Effect.runPromise(
        tenantFilterAllowsEffect({}, { tenant_id: "t-a", status: "ok" }, "t-a")
      )
    ).toBe(true);
  });

  it("blocks cross-tenant even when filter names the event tenant", async () => {
    expect(
      await Effect.runPromise(
        tenantFilterAllowsEffect({ tenant_id: "t-b" }, { tenant_id: "t-b" }, "t-a")
      )
    ).toBe(false);
  });

  it("matchesEventFiltersEffect enforces claims tenant isolation", async () => {
    const ok = await Effect.runPromise(
      matchesEventFiltersEffect(
        { document_id: "d1" },
        { tenant_id: "t-a", document_id: "d1" },
        "t-a"
      )
    );
    expect(ok).toBe(true);
    const spoof = await Effect.runPromise(
      matchesEventFiltersEffect(
        { tenant_id: "t-b", document_id: "d1" },
        { tenant_id: "t-b", document_id: "d1" }
      )
    );
    expect(spoof).toBe(false);
  });
});
