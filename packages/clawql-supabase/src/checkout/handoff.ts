/**
 * Supabase session → Stripe Checkout CPC metadata.
 * Keys align with clawql-payments `buildCheckoutSessionMetadata` + optional supabase link.
 */

import { Effect } from "effect";
import type { SupabaseSessionClaims } from "../auth/supabase-auth-service.js";

export type SupabaseCheckoutPlan = "pro" | "team";
export type SupabaseCheckoutBillingMode = "stripe_checkout" | "hybrid";

export type SupabaseCheckoutHandoffInput = {
  readonly orgName: string;
  readonly plan: SupabaseCheckoutPlan;
  readonly ownerEmail?: string;
  readonly billingMode?: SupabaseCheckoutBillingMode;
  readonly claims: Pick<SupabaseSessionClaims, "sub" | "email">;
};

export type SupabaseCheckoutMetadata = {
  readonly clawql_provision_org: "1";
  readonly clawql_org_name: string;
  readonly clawql_plan: SupabaseCheckoutPlan;
  readonly clawql_billing_mode: SupabaseCheckoutBillingMode;
  readonly clawql_owner_email: string;
  readonly clawql_supabase_user_id: string;
  readonly clawql_created_via: "self_serve";
};

/** Stable member tenant id for CPC when the human identity is a Supabase user. */
export const supabaseOwnerMemberTenantIdEffect = (supabaseUserId: string): Effect.Effect<string> =>
  Effect.sync(() => `supabase:${supabaseUserId.trim()}`);

export const buildSupabaseCheckoutMetadataEffect = (
  input: SupabaseCheckoutHandoffInput
): Effect.Effect<SupabaseCheckoutMetadata, Error> =>
  Effect.sync(() => {
    const orgName = input.orgName.trim();
    if (!orgName) throw new Error("orgName is required");
    const ownerEmail = (input.ownerEmail ?? input.claims.email ?? "").trim();
    if (!ownerEmail) throw new Error("owner email is required (claims.email or ownerEmail)");
    const sub = input.claims.sub.trim();
    if (!sub) throw new Error("Supabase claims.sub is required");
    return {
      clawql_provision_org: "1" as const,
      clawql_org_name: orgName,
      clawql_plan: input.plan,
      clawql_billing_mode: input.billingMode ?? "stripe_checkout",
      clawql_owner_email: ownerEmail,
      clawql_supabase_user_id: sub,
      clawql_created_via: "self_serve" as const,
    };
  });

/** Promise façade for clawql.com / Express hosts. */
export async function buildSupabaseCheckoutMetadata(
  input: SupabaseCheckoutHandoffInput
): Promise<SupabaseCheckoutMetadata> {
  return Effect.runPromise(buildSupabaseCheckoutMetadataEffect(input));
}
