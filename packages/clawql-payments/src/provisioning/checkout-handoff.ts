/**
 * Stripe Checkout → provisionOrg handoff (converge CF gateway + Node webhook).
 *
 * Cloudflare gateway today provisions D1 tenants on `checkout.session.completed`.
 * Node CPC calls the same {@link ProvisionOrgService.provisionOrg} Effect when
 * Checkout metadata requests org provisioning (`clawql_provision_org=1` or
 * `clawql_org_name`). Gateway should eventually call the same logic (HTTP/RPC)
 * instead of forking a second provisioner.
 *
 * @see docs/specs/billing/customer-provisioning-core-v0.1.md §4
 */

import type Stripe from "stripe";
import { isClawqlPlanId, type ClawqlPlanId } from "../plans/tiers.js";
import type { OrgBillingMode, OrgCreatedVia } from "../credits/org.js";
import type { ProvisionOrgInput } from "./types.js";

export type CheckoutProvisionHandoff =
  | { ok: true; input: ProvisionOrgInput }
  | { ok: false; reason: string };

function metaString(
  metadata: Stripe.Metadata | null | undefined,
  key: string
): string | undefined {
  const v = metadata?.[key];
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function mapPlan(raw: string | undefined): ClawqlPlanId {
  if (raw && isClawqlPlanId(raw)) return raw;
  const lower = raw?.trim().toLowerCase();
  if (lower === "developer" || lower === "teams") return "pro";
  if (lower === "trial") return "free";
  return "pro";
}

function mapBillingMode(
  mode: string | undefined,
  explicit: string | undefined
): OrgBillingMode {
  if (
    explicit === "stripe_checkout" ||
    explicit === "stripe_invoice" ||
    explicit === "hybrid" ||
    explicit === "credits_only"
  ) {
    return explicit;
  }
  if (mode === "payment") return "credits_only";
  return "stripe_checkout";
}

/**
 * Build {@link ProvisionOrgInput} from a Stripe Checkout Session when CPC
 * metadata is present. Returns `{ ok: false }` when the session is not an
 * org-provisioning checkout (gateway may still mint a D1 tenant).
 */
export function provisionOrgInputFromCheckoutSession(
  session: Pick<
    Stripe.Checkout.Session,
    "id" | "customer" | "subscription" | "mode" | "metadata" | "customer_details" | "customer_email"
  >,
  options: { correlationId?: string; env?: NodeJS.ProcessEnv } = {}
): CheckoutProvisionHandoff {
  const metadata = session.metadata;
  const flag = metaString(metadata, "clawql_provision_org");
  const orgName =
    metaString(metadata, "clawql_org_name") || metaString(metadata, "org_name");
  const wantsProvision =
    flag === "1" || flag === "true" || Boolean(orgName);

  if (!wantsProvision) {
    return {
      ok: false,
      reason: "checkout session missing clawql_provision_org / clawql_org_name metadata",
    };
  }

  const ownerEmail =
    metaString(metadata, "clawql_owner_email") ||
    metaString(metadata, "owner_email") ||
    session.customer_email?.trim() ||
    session.customer_details?.email?.trim();

  if (!ownerEmail) {
    return { ok: false, reason: "checkout session has no owner email" };
  }

  const planId = mapPlan(
    metaString(metadata, "clawql_plan") ||
      metaString(metadata, "clawql_tier") ||
      metaString(metadata, "plan")
  );
  const billingMode = mapBillingMode(
    session.mode ?? undefined,
    metaString(metadata, "clawql_billing_mode")
  );
  const createdVia: OrgCreatedVia =
    metaString(metadata, "clawql_created_via") === "enterprise_sales"
      ? "enterprise_sales"
      : "self_serve";

  const customer =
    typeof session.customer === "string"
      ? session.customer
      : session.customer && typeof session.customer === "object" && "id" in session.customer
        ? String((session.customer as { id: string }).id)
        : undefined;
  const subscription =
    typeof session.subscription === "string"
      ? session.subscription
      : session.subscription &&
          typeof session.subscription === "object" &&
          "id" in session.subscription
        ? String((session.subscription as { id: string }).id)
        : undefined;

  const additional = metaString(metadata, "clawql_member_emails");
  const additionalMemberEmails = additional
    ? additional
        .split(/[\s,;]+/)
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean)
    : undefined;

  return {
    ok: true,
    input: {
      orgName: orgName || ownerEmail.split("@")[1] || "customer",
      orgId: metaString(metadata, "clawql_org_id"),
      ownerEmail,
      planId,
      createdVia,
      billingMode,
      stripeCustomerId: customer,
      stripeSubscriptionId: subscription,
      additionalMemberEmails,
      correlationId: options.correlationId ?? session.id,
      env: options.env,
    },
  };
}

/**
 * Convergence note for Cloudflare gateway operators.
 * Gateway D1 tenant upsert remains for hosted edge auth; CPC org store lives
 * in Node payments (`org-credits.json`). Production path: gateway posts into
 * payments `provisionOrg` (or shares the Effect via a worker binding) after
 * Checkout completes so both stores stay aligned.
 */
export const CHECKOUT_PROVISION_CONVERGENCE_NOTE =
  "CF gateway checkout.session.completed → D1 tenant today; Node CPC uses provisionOrgInputFromCheckoutSession + ProvisionOrgService. Converge by calling the same provisionOrg Effect from both edges.";
