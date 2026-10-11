import { describe, expect, it } from "vitest";
import { provisionOrgInputFromCheckoutSession } from "./checkout-handoff.js";

describe("provisionOrgInputFromCheckoutSession", () => {
  it("maps clawql_user_id to ownerMemberTenantId and ignores supabase tenant prefix", () => {
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
        clawql_user_id: "usr_abcdef0123456789",
        clawql_supabase_user_id: "user-abc",
      },
    });
    expect(handoff.ok).toBe(true);
    if (!handoff.ok) return;
    expect(handoff.input.ownerMemberTenantId).toBe("usr_abcdef0123456789");
    expect(handoff.input.clawqlUserId).toBe("usr_abcdef0123456789");
    expect(handoff.input.ownerMemberTenantId).not.toMatch(/^supabase:/);
    expect(handoff.input.stripeCheckoutSessionId).toBe("cs_test_1");
    expect(handoff.input.ownerEmail).toBe("owner@acme.com");
  });

  it("does not key tenants on supabase user ids when clawql_user_id is absent", () => {
    const handoff = provisionOrgInputFromCheckoutSession({
      id: "cs_test_2",
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
    expect(handoff.input.ownerMemberTenantId).toBeUndefined();
    expect(handoff.input.clawqlUserId).toBeUndefined();
  });
});
