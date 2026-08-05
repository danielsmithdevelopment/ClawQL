/**
 * Closed-loop enterprise org credits — company credit pool, role budgets,
 * member balances, and within-org peer transfers.
 *
 * Credits are redeemable only for ClawQL services. Transfers never leave the org.
 * This is distinct from cross-tenant Venmo-like P2P (`CLAWQL_CREDITS_P2P_ENABLED`).
 *
 * @see docs/payments/org-credits.md
 * @see docs/payments/hosted-vs-self-hosted-compliance.md
 */

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { resolveOrgCreditsPath } from "../config/paths.js";
import { getCreditAccount, transferCredits, type CreditTransferResult } from "./ledger.js";
import {
  assertCreditsOrgTransferEnabled,
  isCreditsEnabled,
  isCreditsOrgTransferEnabled,
  isManagedHosting,
} from "./config.js";

export { isCreditsOrgTransferEnabled, assertCreditsOrgTransferEnabled };
export type OrgRoleId = "intern" | "employee" | "senior" | "staff" | (string & {});

export type OrgMemberRole = "billing_admin" | "manager" | "member";

export type OrgRolePolicy = {
  roleId: OrgRoleId;
  /** USD cents granted from the pool to each member with this role at period distribute. */
  defaultGrantCents: number;
  /** Optional cap on member spendable balance after allocate/transfer. */
  maxBalanceCents?: number;
};

export type OrgMembership = {
  memberTenantId: string;
  /** Job-family role for budget allocation (intern / employee / senior / …). */
  allocationRoleId: OrgRoleId;
  /** Capability role within the org. */
  orgRole: OrgMemberRole;
  status: "active" | "suspended" | "left";
  displayName?: string;
  /** Work email used for SSO / invites (must match allowedEmailDomains when set). */
  email?: string;
  invitedAt?: string;
  invitedByTenantId?: string;
  joinedAt: string;
};

export type OrgSsoPolicy = {
  /** Company email domains that may join via SSO (e.g. `acme.com`). */
  allowedEmailDomains: string[];
  /** Optional per-org IdP issuer (multi-tenant SaaS). */
  issuer?: string;
  /** Optional per-org JWKS URL. */
  jwksUrl?: string;
};

export type OrgCreditPeriodPolicy = "expire_to_pool" | "rollover";

export type OrgRecord = {
  orgId: string;
  displayName?: string;
  /** Ledger account that holds the company pool (convention: org:{orgId}:pool). */
  poolTenantId: string;
  billingAdminTenantIds: string[];
  rolePolicies: OrgRolePolicy[];
  members: OrgMembership[];
  /** Company-email SSO binding (domains + optional IdP). */
  sso?: OrgSsoPolicy;
  /** What happens to unused member credits at period redistribute. Default expire_to_pool. */
  periodEndPolicy: OrgCreditPeriodPolicy;
  createdAt: string;
  updatedAt: string;
};

export type OrgCreditsFile = {
  version: 1;
  orgs: Record<string, OrgRecord>;
};

function emptyFile(): OrgCreditsFile {
  return { version: 1, orgs: {} };
}

export function poolTenantIdForOrg(orgId: string): string {
  return `org:${orgId.trim()}:pool`;
}

export async function loadOrgCreditsFile(
  env: NodeJS.ProcessEnv = process.env
): Promise<OrgCreditsFile> {
  const path = resolveOrgCreditsPath(env);
  try {
    const raw = await readFile(path, "utf8");
    const parsed = JSON.parse(raw) as OrgCreditsFile;
    if (!parsed || typeof parsed !== "object" || parsed.version !== 1) return emptyFile();
    return { version: 1, orgs: parsed.orgs ?? {} };
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code === "ENOENT") return emptyFile();
    throw err;
  }
}

async function saveOrgCreditsFile(
  file: OrgCreditsFile,
  env: NodeJS.ProcessEnv = process.env
): Promise<void> {
  const path = resolveOrgCreditsPath(env);
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const tmp = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmp, `${JSON.stringify(file, null, 2)}\n`, { mode: 0o600 });
  await rename(tmp, path);
}

export async function resetOrgCreditsForTests(env: NodeJS.ProcessEnv = process.env): Promise<void> {
  await saveOrgCreditsFile(emptyFile(), env);
}

const DEFAULT_ROLE_POLICIES: OrgRolePolicy[] = [
  { roleId: "intern", defaultGrantCents: 1000 },
  { roleId: "employee", defaultGrantCents: 2000 },
  { roleId: "senior", defaultGrantCents: 5000 },
  { roleId: "staff", defaultGrantCents: 5000 },
];

export type CreateOrgInput = {
  orgId: string;
  displayName?: string;
  billingAdminTenantId: string;
  rolePolicies?: OrgRolePolicy[];
  periodEndPolicy?: OrgCreditPeriodPolicy;
  /** Seed company-email SSO domains (e.g. `["acme.com"]`). */
  allowedEmailDomains?: string[];
  ssoIssuer?: string;
  ssoJwksUrl?: string;
  billingAdminEmail?: string;
};

export async function createOrg(
  input: CreateOrgInput,
  env: NodeJS.ProcessEnv = process.env
): Promise<OrgRecord> {
  if (!isCreditsEnabled(env)) {
    throw new Error("Credits disabled — set CLAWQL_CREDITS_ENABLED=1");
  }
  const orgId = input.orgId
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "-");
  if (!orgId) throw new Error("orgId is required");
  const admin = input.billingAdminTenantId.trim();
  if (!admin) throw new Error("billingAdminTenantId is required");

  const file = await loadOrgCreditsFile(env);
  if (file.orgs[orgId]) throw new Error(`Org already exists: ${orgId}`);

  const now = new Date().toISOString();
  const domains = normalizeDomains(input.allowedEmailDomains);
  const org: OrgRecord = {
    orgId,
    displayName: input.displayName?.trim() || orgId,
    poolTenantId: poolTenantIdForOrg(orgId),
    billingAdminTenantIds: [admin],
    rolePolicies: input.rolePolicies?.length ? input.rolePolicies : DEFAULT_ROLE_POLICIES,
    members: [
      {
        memberTenantId: admin,
        allocationRoleId: "staff",
        orgRole: "billing_admin",
        status: "active",
        email: input.billingAdminEmail?.trim().toLowerCase() || undefined,
        joinedAt: now,
      },
    ],
    ...(domains.length || input.ssoIssuer || input.ssoJwksUrl
      ? {
          sso: {
            allowedEmailDomains: domains,
            issuer: input.ssoIssuer?.trim() || undefined,
            jwksUrl: input.ssoJwksUrl?.trim() || undefined,
          },
        }
      : {}),
    periodEndPolicy: input.periodEndPolicy ?? "expire_to_pool",
    createdAt: now,
    updatedAt: now,
  };
  file.orgs[orgId] = org;
  await saveOrgCreditsFile(file, env);
  return org;
}

export async function getOrg(
  orgId: string,
  env: NodeJS.ProcessEnv = process.env
): Promise<OrgRecord | undefined> {
  const file = await loadOrgCreditsFile(env);
  return file.orgs[orgId.trim().toLowerCase()];
}

export async function setOrgRolePolicies(
  orgId: string,
  policies: OrgRolePolicy[],
  env: NodeJS.ProcessEnv = process.env
): Promise<OrgRecord> {
  const file = await loadOrgCreditsFile(env);
  const key = orgId.trim().toLowerCase();
  const org = file.orgs[key];
  if (!org) throw new Error(`Unknown org: ${orgId}`);
  if (!policies.length) throw new Error("At least one role policy is required");
  org.rolePolicies = policies.map((p) => ({
    roleId: p.roleId,
    defaultGrantCents: Math.max(0, Math.round(p.defaultGrantCents)),
    maxBalanceCents:
      p.maxBalanceCents !== undefined ? Math.max(0, Math.round(p.maxBalanceCents)) : undefined,
  }));
  org.updatedAt = new Date().toISOString();
  file.orgs[key] = org;
  await saveOrgCreditsFile(file, env);
  return org;
}

export type AddOrgMemberInput = {
  orgId: string;
  memberTenantId: string;
  allocationRoleId: OrgRoleId;
  orgRole?: OrgMemberRole;
  displayName?: string;
  email?: string;
  actorTenantId: string;
};

export async function addOrgMember(
  input: AddOrgMemberInput,
  env: NodeJS.ProcessEnv = process.env
): Promise<OrgRecord> {
  const file = await loadOrgCreditsFile(env);
  const key = input.orgId.trim().toLowerCase();
  const org = file.orgs[key];
  if (!org) throw new Error(`Unknown org: ${input.orgId}`);
  assertBillingAdmin(org, input.actorTenantId);

  const memberId = input.memberTenantId.trim();
  if (!memberId) throw new Error("memberTenantId is required");
  if (memberId === org.poolTenantId) throw new Error("Cannot add pool account as a member");
  if (input.email) assertEmailMatchesOrgDomains(org, input.email);

  const existing = org.members.find((m) => m.memberTenantId === memberId);
  const now = new Date().toISOString();
  if (existing) {
    existing.status = "active";
    existing.allocationRoleId = input.allocationRoleId;
    existing.orgRole = input.orgRole ?? existing.orgRole;
    if (input.displayName) existing.displayName = input.displayName;
    if (input.email) existing.email = input.email.trim().toLowerCase();
  } else {
    org.members.push({
      memberTenantId: memberId,
      allocationRoleId: input.allocationRoleId,
      orgRole: input.orgRole ?? "member",
      status: "active",
      displayName: input.displayName,
      email: input.email?.trim().toLowerCase(),
      joinedAt: now,
    });
  }
  if (input.orgRole === "billing_admin" && !org.billingAdminTenantIds.includes(memberId)) {
    org.billingAdminTenantIds.push(memberId);
  }
  org.updatedAt = now;
  file.orgs[key] = org;
  await saveOrgCreditsFile(file, env);
  return org;
}

function assertBillingAdmin(org: OrgRecord, actorTenantId: string): void {
  const actor = actorTenantId.trim();
  if (!org.billingAdminTenantIds.includes(actor)) {
    throw new Error(`Actor ${actor} is not a billing admin for org ${org.orgId}`);
  }
}

function normalizeDomains(domains: string[] | undefined): string[] {
  if (!domains?.length) return [];
  return [
    ...new Set(
      domains
        .map((d) => d.trim().toLowerCase().replace(/^@/, ""))
        .filter(Boolean)
    ),
  ];
}

export function emailDomainOf(email: string): string | undefined {
  const at = email.lastIndexOf("@");
  if (at < 0) return undefined;
  return email.slice(at + 1).trim().toLowerCase() || undefined;
}

export function assertEmailMatchesOrgDomains(org: OrgRecord, email: string): void {
  const domains = org.sso?.allowedEmailDomains ?? [];
  if (!domains.length) return;
  const domain = emailDomainOf(email.trim().toLowerCase());
  if (!domain || !domains.includes(domain)) {
    throw new Error(
      `Email must be under company domain(s) ${domains.join(", ")} for org ${org.orgId}`
    );
  }
}

/** Resolve the company org that owns a work-email domain (first match). */
export async function findOrgByEmailDomain(
  domain: string,
  env: NodeJS.ProcessEnv = process.env
): Promise<OrgRecord | undefined> {
  const needle = domain.trim().toLowerCase().replace(/^@/, "");
  if (!needle) return undefined;
  const file = await loadOrgCreditsFile(env);
  return Object.values(file.orgs).find((o) =>
    (o.sso?.allowedEmailDomains ?? []).includes(needle)
  );
}

/**
 * Billing admin: bind company email domains (+ optional IdP) for SSO under @company.com.
 */
export async function setOrgSsoPolicy(
  input: {
    orgId: string;
    actorTenantId: string;
    allowedEmailDomains: string[];
    issuer?: string;
    jwksUrl?: string;
  },
  env: NodeJS.ProcessEnv = process.env
): Promise<OrgRecord> {
  const file = await loadOrgCreditsFile(env);
  const key = input.orgId.trim().toLowerCase();
  const org = file.orgs[key];
  if (!org) throw new Error(`Unknown org: ${input.orgId}`);
  assertBillingAdmin(org, input.actorTenantId);
  const domains = normalizeDomains(input.allowedEmailDomains);
  if (!domains.length) throw new Error("At least one allowedEmailDomain is required");
  org.sso = {
    allowedEmailDomains: domains,
    issuer: input.issuer?.trim() || org.sso?.issuer,
    jwksUrl: input.jwksUrl?.trim() || org.sso?.jwksUrl,
  };
  org.updatedAt = new Date().toISOString();
  file.orgs[key] = org;
  await saveOrgCreditsFile(file, env);
  return org;
}

export type InviteOrgMemberInput = {
  orgId: string;
  email: string;
  memberTenantId?: string;
  allocationRoleId: OrgRoleId;
  orgRole?: OrgMemberRole;
  displayName?: string;
  actorTenantId: string;
};

/**
 * Billing admin: invite a colleague by company email.
 * `memberTenantId` defaults to a slug derived from the email local-part + org.
 */
export async function inviteOrgMember(
  input: InviteOrgMemberInput,
  env: NodeJS.ProcessEnv = process.env
): Promise<OrgRecord> {
  const email = input.email.trim().toLowerCase();
  if (!email.includes("@")) throw new Error("Valid work email is required");
  const memberTenantId =
    input.memberTenantId?.trim() ||
    `${input.orgId.trim().toLowerCase()}:${email.replace(/[^a-z0-9]+/gi, "-")}`;

  const file = await loadOrgCreditsFile(env);
  const key = input.orgId.trim().toLowerCase();
  const org = file.orgs[key];
  if (!org) throw new Error(`Unknown org: ${input.orgId}`);
  assertBillingAdmin(org, input.actorTenantId);
  assertEmailMatchesOrgDomains(org, email);

  const now = new Date().toISOString();
  const existing = org.members.find(
    (m) => m.memberTenantId === memberTenantId || m.email === email
  );
  if (existing) {
    existing.status = "active";
    existing.email = email;
    existing.allocationRoleId = input.allocationRoleId;
    existing.orgRole = input.orgRole ?? existing.orgRole;
    if (input.displayName) existing.displayName = input.displayName;
    existing.invitedAt = now;
    existing.invitedByTenantId = input.actorTenantId.trim();
  } else {
    org.members.push({
      memberTenantId,
      allocationRoleId: input.allocationRoleId,
      orgRole: input.orgRole ?? "member",
      status: "active",
      displayName: input.displayName,
      email,
      invitedAt: now,
      invitedByTenantId: input.actorTenantId.trim(),
      joinedAt: now,
    });
  }
  if (input.orgRole === "billing_admin" && !org.billingAdminTenantIds.includes(memberTenantId)) {
    org.billingAdminTenantIds.push(memberTenantId);
  }
  org.updatedAt = now;
  file.orgs[key] = org;
  await saveOrgCreditsFile(file, env);
  return org;
}

export async function listOrgMembers(
  orgId: string,
  options: { status?: OrgMembership["status"] | "any"; actorTenantId?: string } = {},
  env: NodeJS.ProcessEnv = process.env
): Promise<OrgMembership[]> {
  const org = await getOrg(orgId, env);
  if (!org) throw new Error(`Unknown org: ${orgId}`);
  if (options.actorTenantId) assertBillingAdmin(org, options.actorTenantId);
  const status = options.status ?? "active";
  if (status === "any") return [...org.members];
  return org.members.filter((m) => m.status === status);
}

export async function suspendOrgMember(
  input: { orgId: string; memberTenantId: string; actorTenantId: string },
  env: NodeJS.ProcessEnv = process.env
): Promise<OrgRecord> {
  return setMemberStatus({ ...input, status: "suspended" }, env);
}

export async function removeOrgMember(
  input: { orgId: string; memberTenantId: string; actorTenantId: string },
  env: NodeJS.ProcessEnv = process.env
): Promise<OrgRecord> {
  return setMemberStatus({ ...input, status: "left" }, env);
}

export async function reactivateOrgMember(
  input: { orgId: string; memberTenantId: string; actorTenantId: string },
  env: NodeJS.ProcessEnv = process.env
): Promise<OrgRecord> {
  return setMemberStatus({ ...input, status: "active" }, env);
}

async function setMemberStatus(
  input: {
    orgId: string;
    memberTenantId: string;
    actorTenantId: string;
    status: OrgMembership["status"];
  },
  env: NodeJS.ProcessEnv
): Promise<OrgRecord> {
  const file = await loadOrgCreditsFile(env);
  const key = input.orgId.trim().toLowerCase();
  const org = file.orgs[key];
  if (!org) throw new Error(`Unknown org: ${input.orgId}`);
  assertBillingAdmin(org, input.actorTenantId);
  const memberId = input.memberTenantId.trim();
  const member = org.members.find((m) => m.memberTenantId === memberId);
  if (!member) throw new Error(`Unknown member: ${memberId}`);
  if (member.orgRole === "billing_admin" && input.status !== "active") {
    const otherAdmins = org.billingAdminTenantIds.filter((id) => id !== memberId);
    if (otherAdmins.length === 0) {
      throw new Error("Cannot suspend/remove the last billing admin");
    }
    org.billingAdminTenantIds = otherAdmins;
    member.orgRole = "member";
  }
  member.status = input.status;
  org.updatedAt = new Date().toISOString();
  file.orgs[key] = org;
  await saveOrgCreditsFile(file, env);
  return org;
}

export function findMembership(org: OrgRecord, memberTenantId: string): OrgMembership | undefined {
  return org.members.find(
    (m) => m.memberTenantId === memberTenantId.trim() && m.status === "active"
  );
}

export function assertSameOrgMembers(org: OrgRecord, a: string, b: string): void {
  const ma = findMembership(org, a);
  const mb = findMembership(org, b);
  if (!ma || !mb) {
    throw new Error(
      `Both parties must be active members of org ${org.orgId} (closed-loop within company only)`
    );
  }
}

/**
 * Billing admin: move credits from company pool → member (top-up individual).
 * Does not require CLAWQL_CREDITS_P2P_ENABLED — closed-loop org allocate.
 */
export async function allocateFromPoolToMember(
  input: {
    orgId: string;
    toMemberTenantId: string;
    amountCents: number;
    actorTenantId: string;
    note?: string;
    idempotencyKey?: string;
  },
  env: NodeJS.ProcessEnv = process.env
): Promise<CreditTransferResult> {
  assertCreditsOrgTransferEnabled(env);
  const org = await getOrg(input.orgId, env);
  if (!org) throw new Error(`Unknown org: ${input.orgId}`);
  assertBillingAdmin(org, input.actorTenantId);
  const member = findMembership(org, input.toMemberTenantId);
  if (!member) throw new Error(`Not an active member: ${input.toMemberTenantId}`);

  const policy = org.rolePolicies.find((p) => p.roleId === member.allocationRoleId);
  if (policy?.maxBalanceCents !== undefined) {
    const acct = await getCreditAccount(member.memberTenantId, env);
    if (acct.balanceCents + input.amountCents > policy.maxBalanceCents) {
      throw new Error(
        `Allocate would exceed maxBalanceCents=${policy.maxBalanceCents} for role ${member.allocationRoleId}`
      );
    }
  }

  return transferCredits(
    {
      fromTenantId: org.poolTenantId,
      toTenantId: member.memberTenantId,
      amountCents: input.amountCents,
      idempotencyKey: input.idempotencyKey,
      note: input.note ?? `org ${org.orgId} allocate to ${member.memberTenantId}`,
      correlationId: `org-alloc:${org.orgId}`,
    },
    env
  );
}

/**
 * Peer transfer within the same company org only.
 * Allowed on managed hosting. Distinct from cross-tenant Venmo P2P.
 */
export async function transferWithinOrg(
  input: {
    orgId: string;
    fromMemberTenantId: string;
    toMemberTenantId: string;
    amountCents: number;
    note?: string;
    idempotencyKey?: string;
  },
  env: NodeJS.ProcessEnv = process.env
): Promise<CreditTransferResult> {
  assertCreditsOrgTransferEnabled(env);
  const org = await getOrg(input.orgId, env);
  if (!org) throw new Error(`Unknown org: ${input.orgId}`);
  assertSameOrgMembers(org, input.fromMemberTenantId, input.toMemberTenantId);
  if (input.fromMemberTenantId.trim() === org.poolTenantId) {
    throw new Error("Use allocateFromPoolToMember for pool → member moves");
  }

  return transferCredits(
    {
      fromTenantId: input.fromMemberTenantId,
      toTenantId: input.toMemberTenantId,
      amountCents: input.amountCents,
      idempotencyKey: input.idempotencyKey,
      note: input.note ?? `org ${org.orgId} peer transfer`,
      correlationId: `org-xfer:${org.orgId}`,
    },
    env
  );
}

export type DistributePeriodResult = {
  orgId: string;
  distributed: Array<{ memberTenantId: string; amountCents: number; transferId: string }>;
  recalled: Array<{ memberTenantId: string; amountCents: number; transferId: string }>;
  skipped: Array<{ memberTenantId: string; reason: string }>;
};

/**
 * Start of billing period: optionally recall unused member credits to pool (expire_to_pool),
 * then grant each active member their role defaultGrantCents from the pool.
 */
export async function distributeOrgPeriod(
  input: { orgId: string; actorTenantId: string; idempotencyPrefix?: string },
  env: NodeJS.ProcessEnv = process.env
): Promise<DistributePeriodResult> {
  assertCreditsOrgTransferEnabled(env);
  const org = await getOrg(input.orgId, env);
  if (!org) throw new Error(`Unknown org: ${input.orgId}`);
  assertBillingAdmin(org, input.actorTenantId);

  const prefix =
    input.idempotencyPrefix?.trim() || `period-${new Date().toISOString().slice(0, 10)}`;
  const distributed: DistributePeriodResult["distributed"] = [];
  const recalled: DistributePeriodResult["recalled"] = [];
  const skipped: DistributePeriodResult["skipped"] = [];

  if (org.periodEndPolicy === "expire_to_pool") {
    for (const m of org.members.filter((x) => x.status === "active")) {
      if (m.memberTenantId === org.poolTenantId) continue;
      const acct = await getCreditAccount(m.memberTenantId, env);
      if (acct.balanceCents <= 0) continue;
      try {
        const result = await transferCredits(
          {
            fromTenantId: m.memberTenantId,
            toTenantId: org.poolTenantId,
            amountCents: acct.balanceCents,
            idempotencyKey: `${prefix}:recall:${m.memberTenantId}`,
            note: `org ${org.orgId} period expire to pool`,
            correlationId: `org-period-recall:${org.orgId}`,
          },
          env
        );
        recalled.push({
          memberTenantId: m.memberTenantId,
          amountCents: result.amountCents,
          transferId: result.transferId,
        });
      } catch (err) {
        skipped.push({
          memberTenantId: m.memberTenantId,
          reason: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  for (const m of org.members.filter((x) => x.status === "active")) {
    if (m.memberTenantId === org.poolTenantId) continue;
    const policy = org.rolePolicies.find((p) => p.roleId === m.allocationRoleId);
    const grant = policy?.defaultGrantCents ?? 0;
    if (grant <= 0) {
      skipped.push({ memberTenantId: m.memberTenantId, reason: "zero defaultGrantCents" });
      continue;
    }
    try {
      const result = await allocateFromPoolToMember(
        {
          orgId: org.orgId,
          toMemberTenantId: m.memberTenantId,
          amountCents: grant,
          actorTenantId: input.actorTenantId,
          note: `org ${org.orgId} period grant role=${m.allocationRoleId}`,
          idempotencyKey: `${prefix}:grant:${m.memberTenantId}`,
        },
        env
      );
      distributed.push({
        memberTenantId: m.memberTenantId,
        amountCents: result.amountCents,
        transferId: result.transferId,
      });
    } catch (err) {
      skipped.push({
        memberTenantId: m.memberTenantId,
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { orgId: org.orgId, distributed, recalled, skipped };
}

/** Compliance helper: managed hosting may use org credits; general P2P still blocked. */
export function orgCreditsAllowedOnManagedHosting(env: NodeJS.ProcessEnv = process.env): boolean {
  // Documented posture — org transfers are closed-loop even when isManagedHosting.
  return isCreditsOrgTransferEnabled(env) || !isManagedHosting(env);
}
