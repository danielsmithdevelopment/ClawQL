import { describe, expect, it } from "vitest";
import { provisionOrgInputFromCheckoutSession } from "./checkout-handoff.js";

describe("provisionOrgInputFromCheckoutSession", () => {
  it("maps clawql_supabase_user_id to ownerMemberTenantId", () => {
    const handoff = provisionOrgInputFromCheckoutSession({
      id: "cs_test_1",
      customer: "cus_1",
      subscription: "sub_1",
      mode: "subscription",
      customer_email: null,
      customer_details: null,
      metadata: {
        clawql_provision_org: "1",
        clawql_org_name: "Acme",
        clawql_owner_email: "owner@acme.com",
        clawql_plan: "pro",
        clawql_supabase_user_id: "user-abc",
      },
    });
    expect(handoff.ok).toBe(true);
    if (!handoff.ok) return;
    expect(handoff.input.ownerMemberTenantId).toBe("supabase:user-abc");
    expect(handoff.input.ownerEmail).toBe("owner@acme.com");
  });
});
