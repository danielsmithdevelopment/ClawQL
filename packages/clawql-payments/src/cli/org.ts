import {
  createOrg,
  getOrg,
  inviteOrgMember,
  listOrgMembers,
  setOrgSsoPolicy,
  suspendOrgMember,
  removeOrgMember,
  allocateFromPoolToMember,
  distributeOrgPeriod,
} from "../credits/org.js";
import { getOrgUnifiedSpendSummary } from "../credits/org-spend.js";
import { renderOrgSpendPrometheus } from "../credits/org-metrics.js";
import { isCreditsEnabled } from "../credits/config.js";

function requireCredits(): void {
  if (!isCreditsEnabled()) {
    throw new Error("Credits disabled — set CLAWQL_CREDITS_ENABLED=1");
  }
}

export type OrgCliOptions = {
  orgId?: string;
  actorTenantId?: string;
  displayName?: string;
  email?: string;
  memberTenantId?: string;
  allocationRoleId?: string;
  domains?: string;
  amountUsd?: number;
  json?: boolean;
  prometheus?: boolean;
  includeWorm?: boolean;
};

export async function runPaymentsOrgCreate(options: OrgCliOptions): Promise<number> {
  requireCredits();
  const orgId = options.orgId?.trim();
  const admin = options.actorTenantId?.trim();
  if (!orgId || !admin) {
    console.error(
      "Usage: clawql payments org create --org-id acme --actor-tenant cfo [--domains acme.com]"
    );
    return 1;
  }
  const domains = options.domains
    ?.split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const org = await createOrg({
    orgId,
    billingAdminTenantId: admin,
    displayName: options.displayName,
    billingAdminEmail: options.email,
    allowedEmailDomains: domains,
  });
  if (options.json) console.log(JSON.stringify(org, null, 2));
  else console.log(`Created org ${org.orgId} pool=${org.poolTenantId}`);
  return 0;
}

export async function runPaymentsOrgShow(options: OrgCliOptions): Promise<number> {
  requireCredits();
  const orgId = options.orgId?.trim();
  if (!orgId) {
    console.error("Usage: clawql payments org show --org-id acme");
    return 1;
  }
  const org = await getOrg(orgId);
  if (!org) {
    console.error(`Unknown org: ${orgId}`);
    return 1;
  }
  console.log(JSON.stringify(org, null, 2));
  return 0;
}

export async function runPaymentsOrgSso(options: OrgCliOptions): Promise<number> {
  requireCredits();
  const orgId = options.orgId?.trim();
  const actor = options.actorTenantId?.trim();
  const domains = options.domains
    ?.split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (!orgId || !actor || !domains?.length) {
    console.error(
      "Usage: clawql payments org sso --org-id acme --actor-tenant cfo --domains acme.com,acme.co.uk"
    );
    return 1;
  }
  const org = await setOrgSsoPolicy({
    orgId,
    actorTenantId: actor,
    allowedEmailDomains: domains,
  });
  if (options.json) console.log(JSON.stringify(org.sso, null, 2));
  else
    console.log(`SSO domains for ${org.orgId}: ${(org.sso?.allowedEmailDomains ?? []).join(", ")}`);
  return 0;
}

export async function runPaymentsOrgInvite(options: OrgCliOptions): Promise<number> {
  requireCredits();
  const orgId = options.orgId?.trim();
  const actor = options.actorTenantId?.trim();
  const email = options.email?.trim();
  const role = options.allocationRoleId?.trim() || "employee";
  if (!orgId || !actor || !email) {
    console.error(
      "Usage: clawql payments org invite --org-id acme --actor-tenant cfo --email intern@acme.com [--role intern]"
    );
    return 1;
  }
  const org = await inviteOrgMember({
    orgId,
    actorTenantId: actor,
    email,
    allocationRoleId: role,
    memberTenantId: options.memberTenantId,
    displayName: options.displayName,
  });
  const member = org.members.find((m) => m.email === email.toLowerCase());
  if (options.json) console.log(JSON.stringify(member ?? org, null, 2));
  else console.log(`Invited ${email} → ${member?.memberTenantId} (${role})`);
  return 0;
}

export async function runPaymentsOrgMembers(options: OrgCliOptions): Promise<number> {
  requireCredits();
  const orgId = options.orgId?.trim();
  if (!orgId) {
    console.error("Usage: clawql payments org members --org-id acme [--actor-tenant cfo]");
    return 1;
  }
  const members = await listOrgMembers(orgId, {
    status: "any",
    actorTenantId: options.actorTenantId,
  });
  if (options.json) console.log(JSON.stringify(members, null, 2));
  else {
    for (const m of members) {
      console.log(
        `${m.status.padEnd(10)} ${m.orgRole.padEnd(14)} ${m.allocationRoleId.padEnd(10)} ${m.memberTenantId} ${m.email ?? ""}`
      );
    }
  }
  return 0;
}

export async function runPaymentsOrgSuspend(options: OrgCliOptions): Promise<number> {
  requireCredits();
  const orgId = options.orgId?.trim();
  const actor = options.actorTenantId?.trim();
  const member = options.memberTenantId?.trim();
  if (!orgId || !actor || !member) {
    console.error(
      "Usage: clawql payments org suspend --org-id acme --actor-tenant cfo --member-tenant …"
    );
    return 1;
  }
  await suspendOrgMember({ orgId, actorTenantId: actor, memberTenantId: member });
  console.log(`Suspended ${member} in ${orgId}`);
  return 0;
}

export async function runPaymentsOrgRemove(options: OrgCliOptions): Promise<number> {
  requireCredits();
  const orgId = options.orgId?.trim();
  const actor = options.actorTenantId?.trim();
  const member = options.memberTenantId?.trim();
  if (!orgId || !actor || !member) {
    console.error(
      "Usage: clawql payments org remove --org-id acme --actor-tenant cfo --member-tenant …"
    );
    return 1;
  }
  await removeOrgMember({ orgId, actorTenantId: actor, memberTenantId: member });
  console.log(`Removed ${member} from ${orgId}`);
  return 0;
}

export async function runPaymentsOrgAllocate(options: OrgCliOptions): Promise<number> {
  requireCredits();
  const orgId = options.orgId?.trim();
  const actor = options.actorTenantId?.trim();
  const member = options.memberTenantId?.trim();
  const cents = Math.round((options.amountUsd ?? 0) * 100);
  if (!orgId || !actor || !member || cents <= 0) {
    console.error(
      "Usage: clawql payments org allocate --org-id acme --actor-tenant cfo --member-tenant … --amount 10"
    );
    return 1;
  }
  const result = await allocateFromPoolToMember({
    orgId,
    actorTenantId: actor,
    toMemberTenantId: member,
    amountCents: cents,
  });
  if (options.json) console.log(JSON.stringify(result, null, 2));
  else console.log(`Allocated ${cents}c → ${member} (${result.transferId})`);
  return 0;
}

export async function runPaymentsOrgDistribute(options: OrgCliOptions): Promise<number> {
  requireCredits();
  const orgId = options.orgId?.trim();
  const actor = options.actorTenantId?.trim();
  if (!orgId || !actor) {
    console.error("Usage: clawql payments org distribute --org-id acme --actor-tenant cfo");
    return 1;
  }
  const result = await distributeOrgPeriod({ orgId, actorTenantId: actor });
  console.log(JSON.stringify(result, null, 2));
  return 0;
}

export async function runPaymentsOrgSpend(options: OrgCliOptions): Promise<number> {
  requireCredits();
  const orgId = options.orgId?.trim();
  if (!orgId) {
    console.error("Usage: clawql payments org spend --org-id acme [--prometheus] [--include-worm]");
    return 1;
  }
  const summary = await getOrgUnifiedSpendSummary({
    orgId,
    actorTenantId: options.actorTenantId,
    includeWormSpend: options.includeWorm,
  });
  if (options.prometheus) {
    const { renderOrgWaterfallPrometheus } = await import("../credits/org-waterfall-metrics.js");
    process.stdout.write(renderOrgSpendPrometheus(summary));
    process.stdout.write(renderOrgWaterfallPrometheus());
    return 0;
  }
  console.log(JSON.stringify(summary, null, 2));
  return 0;
}
