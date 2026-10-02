/**
 * Customer Provisioning Core (CPC) types.
 * @see docs/specs/billing/customer-provisioning-core-v0.1.md
 */

import type { ClawqlPlanId } from "../plans/tiers.js";
import type { OrgBillingMode, OrgCreatedVia } from "../credits/org.js";

export type ProvisionOrgInput = {
  orgName: string;
  ownerEmail: string;
  planId: ClawqlPlanId;
  createdVia: OrgCreatedVia;
  billingMode: OrgBillingMode;
  /** Explicit org id; defaults to slug of orgName. */
  orgId?: string;
  /** Explicit owner member tenant id; defaults to orgId:email-local-slug. */
  ownerMemberTenantId?: string;
  /** Optional Stripe ids when webhook already created customer/subscription. */
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  /** Enterprise: additional seats to invite at provision time. */
  additionalMemberEmails?: readonly string[];
  /** Optional SSO domains (defaults to owner email domain when present). */
  allowedEmailDomains?: readonly string[];
  seatLimit?: number;
  correlationId?: string;
  /** Skip issuing a default API key (tests / gateway that mints separately). */
  skipApiKey?: boolean;
  env?: NodeJS.ProcessEnv;
};

export type ProvisionOrgResult = {
  orgId: string;
  poolTenantId: string;
  ownerMemberTenantId: string;
  /** Raw default API key — shown once. Absent when skipApiKey. */
  apiKey?: string;
  apiKeyId?: string;
  planId: ClawqlPlanId;
  billingMode: OrgBillingMode;
  createdVia: OrgCreatedVia;
};

export type ReportUsageToStripeInput = {
  orgId: string;
  /**
   * Explicit overage units to report. When omitted, computed as
   * max(0, sum(member+pool inference usage) − plan included quota).
   */
  overageUnits?: number;
  /** Usage month `YYYY-MM` (UTC). Defaults to current UTC month. */
  month?: string;
  correlationId?: string;
  identifier?: string;
  env?: NodeJS.ProcessEnv;
};

export type ReportUsageToStripeResult =
  | {
      reported: true;
      eventId: string;
      overageUnits: number;
      includedQuota: number;
      totalUsage: number;
    }
  | {
      reported: false;
      reason: string;
      overageUnits: number;
      includedQuota: number;
      totalUsage: number;
    };

export type DateRange = {
  from: Date;
  to: Date;
};
