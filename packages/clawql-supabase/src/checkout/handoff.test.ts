import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import {
  buildSupabaseCheckoutMetadataEffect,
  supabaseOwnerMemberTenantIdEffect,
} from "./handoff.js";

describe("buildSupabaseCheckoutMetadataEffect", () => {
  it("builds CPC metadata with supabase user id", async () => {
    const meta = await Effect.runPromise(
      buildSupabaseCheckoutMetadataEffect({
        orgName: " Acme ",
        plan: "pro",
        claims: { sub: "user-123", email: "owner@acme.com" },
      })
    );
    expect(meta).toEqual({
      clawql_provision_org: "1",
      clawql_org_name: "Acme",
      clawql_plan: "pro",
      clawql_billing_mode: "stripe_checkout",
      clawql_owner_email: "owner@acme.com",
      clawql_supabase_user_id: "user-123",
      clawql_created_via: "self_serve",
    });
  });

  it("fails without email", async () => {
    await expect(
      Effect.runPromise(
        buildSupabaseCheckoutMetadataEffect({
          orgName: "Acme",
          plan: "team",
          claims: { sub: "u1", email: undefined },
        })
      )
    ).rejects.toThrow(/owner email/i);
  });
});

describe("supabaseOwnerMemberTenantIdEffect", () => {
  it("prefixes supabase user id", async () => {
    expect(await Effect.runPromise(supabaseOwnerMemberTenantIdEffect(" abc "))).toBe(
      "supabase:abc"
    );
  });
});
