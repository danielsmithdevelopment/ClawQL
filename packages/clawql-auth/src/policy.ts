/**
 * Policy hooks for gateway / MCP tools.
 * ClawQL enforces IdP-issued ACR/AMR — it does not replace the IdP.
 */

import type { AtrClaims } from "./gateway.js";

export type EmailDomainPolicyOptions = {
  /** Allowed domains without `@` (e.g. `acme.com`). Empty/undefined = no domain gate. */
  allowedDomains?: string[];
  /** When true, require a resolvable email domain even if allowlist is empty. */
  require?: boolean;
};

/** Extract the domain from an email address (lowercased). */
export function extractEmailDomain(email: string | undefined | null): string | undefined {
  if (!email || typeof email !== "string") return undefined;
  const at = email.lastIndexOf("@");
  if (at < 0 || at === email.length - 1) return undefined;
  return (
    email
      .slice(at + 1)
      .trim()
      .toLowerCase() || undefined
  );
}

export function normalizeEmailDomain(domain: string): string {
  return domain.trim().toLowerCase().replace(/^@/, "");
}

/**
 * Enforce company-email SSO: claims.emailDomain (or email) must be in the allowlist
 * when a policy is configured.
 */
export function assertEmailDomainAllowed(
  claims: AtrClaims,
  options: EmailDomainPolicyOptions = {}
): void {
  const allowed = (options.allowedDomains ?? []).map(normalizeEmailDomain).filter(Boolean);
  const require = options.require === true || allowed.length > 0;
  if (!require) return;

  const domain = claims.emailDomain?.trim().toLowerCase() || extractEmailDomain(claims.email);
  if (!domain) {
    throw new Error("Company SSO requires a work email (or hd) claim on the IdP token");
  }
  if (allowed.length > 0 && !allowed.includes(domain)) {
    throw new Error(
      `Email domain "${domain}" is not allowed for this ClawQL tenant (allowed: ${allowed.join(", ")})`
    );
  }
}

/** Default MCP tool names treated as financial / high-impact when MFA policy is on. */
export const DEFAULT_FINANCIAL_TOOL_NAMES: readonly string[] = [
  "payments_credits_transfer_stage",
  "payments_credits_transfer_confirm",
  "payments_credits_transfer",
  "payments_payout_create",
  "payments_withdraw",
];

function envFlag(name: string, env: NodeJS.ProcessEnv): boolean {
  const v = env[name]?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/** When true, financial MCP tools require MFA-class ACR/AMR on ATR claims. */
export function isMfaRequiredForFinancialTools(env: NodeJS.ProcessEnv = process.env): boolean {
  return envFlag("CLAWQL_AUTH_REQUIRE_MFA_FOR_FINANCIAL", env);
}

function parseToolList(env: NodeJS.ProcessEnv): string[] | undefined {
  const raw = env.CLAWQL_AUTH_FINANCIAL_TOOLS?.trim();
  if (!raw) return undefined;
  return raw
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function resolveFinancialToolNames(env: NodeJS.ProcessEnv = process.env): readonly string[] {
  return parseToolList(env) ?? DEFAULT_FINANCIAL_TOOL_NAMES;
}

const MFA_ACR_HINTS = [
  "mfa",
  "phr",
  "pop",
  "urn:oasis:names:tc:SAML:2.0:ac:classes:MobileTwoFactorContract",
];
const MFA_AMR_HINTS = ["mfa", "otp", "totp", "hotp", "sms", "hwk", "swk", "face", "fpt", "rba"];

/**
 * True when claims indicate multi-factor authentication via `acr` or `amr`.
 * Conservative: `amr` must include a second factor hint beyond password-only when both pwd+otp present,
 * or any known MFA method token.
 */
export function claimsHaveMfa(claims: AtrClaims): boolean {
  const acr = claims.acr?.trim().toLowerCase() ?? "";
  if (acr) {
    if (MFA_ACR_HINTS.some((h) => acr === h || acr.includes(h))) return true;
    // Numeric ACR levels commonly used by IdPs (2+ ≈ MFA)
    const n = Number(acr);
    if (Number.isFinite(n) && n >= 2) return true;
  }
  const amr = (claims.amr ?? []).map((a) => a.toLowerCase());
  if (amr.length === 0) return false;
  if (amr.includes("mfa")) return true;
  const hasOtp = amr.some((a) => ["otp", "totp", "hotp", "sms"].includes(a));
  const hasHardware = amr.some((a) => ["hwk", "swk", "pop", "face", "fpt"].includes(a));
  if (hasOtp || hasHardware) return true;
  return MFA_AMR_HINTS.some((h) => amr.includes(h) && h !== "pwd");
}

export function isFinancialTool(toolName: string, env: NodeJS.ProcessEnv = process.env): boolean {
  const name = toolName.trim();
  if (!name) return false;
  return resolveFinancialToolNames(env).includes(name);
}

export type AssertToolPolicyOptions = {
  env?: NodeJS.ProcessEnv;
  /** Override MFA requirement (default: CLAWQL_AUTH_REQUIRE_MFA_FOR_FINANCIAL). */
  requireMfaForFinancial?: boolean;
};

/**
 * Enforce tool access policy against ATR claims.
 * Today: optional MFA gate for financial tools. Extensible for RBAC/ABAC later.
 */
export function assertToolPolicy(
  claims: AtrClaims,
  toolName: string,
  options: AssertToolPolicyOptions = {}
): void {
  const env = options.env ?? process.env;
  const requireMfa = options.requireMfaForFinancial ?? isMfaRequiredForFinancialTools(env);
  if (!requireMfa) return;
  if (!isFinancialTool(toolName, env)) return;
  if (claimsHaveMfa(claims)) return;
  throw new Error(
    `Tool "${toolName}" requires MFA-class ATR claims (acr/amr). Set CLAWQL_AUTH_REQUIRE_MFA_FOR_FINANCIAL=0 to disable, or obtain an IdP token with MFA.`
  );
}

/** Convenience: require MFA on claims regardless of tool name. */
export function assertClaimsHaveMfa(claims: AtrClaims, reason = "MFA required"): void {
  if (!claimsHaveMfa(claims)) {
    throw new Error(reason);
  }
}
