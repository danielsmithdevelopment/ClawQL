import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { buildSupabaseCheckoutMetadataEffect } from "./handoff.js";

describe("buildSupabaseCheckoutMetadataEffect", () => {
  it("builds CPC metadata with internal clawql user id plus linked supabase subject", async () => {
    const meta = await Effect.runPromise(
      buildSupabaseCheckoutMetadataEffect({
        orgName: " Acme ",
        plan: "pro",
        clawqlUserId: "usr_abcdef0123456789",
        claims: { sub: "user-123", email: "owner@acme.com" },
      })
    );
    expect(meta).toEqual({
      clawql_provision_org: "1",
      clawql_org_name: "Acme",
      clawql_plan: "pro",
      clawql_billing_mode: "stripe_checkout",
      clawql_owner_email: "owner@acme.com",
      clawql_user_id: "usr_abcdef0123456789",
      clawql_supabase_user_id: "user-123",
      clawql_created_via: "self_serve",
    });
  });

  it("refuses supabase-prefixed tenant ids", async () => {
    await expect(
      Effect.runPromise(
        buildSupabaseCheckoutMetadataEffect({
          orgName: "Acme",
          plan: "pro",
          clawqlUserId: "supabase:user-123",
          claims: { sub: "user-123", email: "o@acme.com" },
        })
      )
    ).rejects.toThrow(/internal ClawQL user id/i);
  });

  it("fails without email", async () => {
    await expect(
      Effect.runPromise(
        buildSupabaseCheckoutMetadataEffect({
          orgName: "Acme",
          plan: "team",
          clawqlUserId: "usr_1",
          claims: { sub: "u1", email: undefined },
        })
      )
    ).rejects.toThrow(/owner email/i);
  });
});
