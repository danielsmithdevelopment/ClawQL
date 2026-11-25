import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { matchesEventFiltersEffect, tenantFilterAllowsEffect } from "./subscription-match.js";

describe("tenantFilterAllowsEffect (audit 5.04)", () => {
  it("allows events without tenant", async () => {
    expect(
      await Effect.runPromise(tenantFilterAllowsEffect({}, { document_id: "d1" }))
    ).toBe(true);
  });

  it("blocks tenant-scoped events when subscription omits tenant filter", async () => {
    expect(
      await Effect.runPromise(
        tenantFilterAllowsEffect({ document_id: "d1" }, { document_id: "d1", tenant_id: "t-a" })
      )
    ).toBe(false);
  });

  it("allows matching tenant_id", async () => {
    expect(
      await Effect.runPromise(
        tenantFilterAllowsEffect({ tenant_id: "t-a" }, { tenant_id: "t-a", status: "ok" })
      )
    ).toBe(true);
  });

  it("matchesEventFiltersEffect enforces tenant isolation", async () => {
    const ok = await Effect.runPromise(
      matchesEventFiltersEffect(
        { tenant_id: "t-a", document_id: "d1" },
        { tenant_id: "t-a", document_id: "d1" }
      )
    );
    expect(ok).toBe(true);
    const cross = await Effect.runPromise(
      matchesEventFiltersEffect(
        { document_id: "d1" },
        { tenant_id: "t-b", document_id: "d1" }
      )
    );
    expect(cross).toBe(false);
  });
});
