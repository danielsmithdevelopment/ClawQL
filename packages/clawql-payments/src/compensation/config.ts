/** Agent compensation + DAOS-aligned two-phase staging. */

function parseTruthy(value: string | undefined): boolean {
  if (value === undefined) return false;
  const n = value.trim().toLowerCase();
  return n === "1" || n === "true" || n === "yes" || n === "on";
}

function parseFalsey(value: string | undefined): boolean {
  if (value === undefined) return false;
  const n = value.trim().toLowerCase();
  return n === "0" || n === "false" || n === "no" || n === "off";
}

function isManagedHosting(env: NodeJS.ProcessEnv): boolean {
  return (
    parseTruthy(env.CLAWQL_MANAGED_HOSTING) ||
    parseTruthy(env.CLAWQL_HOSTED_MODE) ||
    parseTruthy(env.CLAWQL_GATEWAY_MANAGED)
  );
}

/**
 * Agent compensation deposit/cash-out. Default **off**.
 * Opt in on self-hosted: `CLAWQL_COMPENSATION_ENABLED=1`.
 * Always off on managed hosting (`CLAWQL_MANAGED_HOSTING=1`).
 */
export function isCompensationEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  if (isManagedHosting(env)) return false;
  if (parseFalsey(env.CLAWQL_COMPENSATION_ENABLED)) return false;
  return parseTruthy(env.CLAWQL_COMPENSATION_ENABLED);
}

export function assertCompensationEnabled(env: NodeJS.ProcessEnv = process.env): void {
  if (isCompensationEnabled(env)) return;
  if (isManagedHosting(env)) {
    throw new Error(
      "Agent compensation is not available on ClawQL managed hosting. " +
        "Self-hosted operators with their own compliance framework may set CLAWQL_COMPENSATION_ENABLED=1."
    );
  }
  throw new Error(
    "Agent compensation is disabled. Set CLAWQL_COMPENSATION_ENABLED=1 on self-hosted only."
  );
}

/** When true, deposit/cashout skip staging (tests / trusted operators only). */
export function isCompensationDirectAllowed(env: NodeJS.ProcessEnv = process.env): boolean {
  return parseTruthy(env.CLAWQL_COMPENSATION_DIRECT);
}

/** PENDING_ACTIONS TTL (seconds). Default 2h — matches DAOS coordination-layer. */
export function compensationActionTtlSec(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.CLAWQL_COMPENSATION_ACTION_TTL_SEC?.trim();
  if (raw && Number.isFinite(Number(raw)) && Number(raw) > 0) return Math.floor(Number(raw));
  return 2 * 60 * 60;
}

/** Base URL for HATEOAS approval_url (gateway or local CLI hint). */
export function compensationApprovalBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  return (
    env.CLAWQL_COMPENSATION_APPROVAL_BASE?.trim() ||
    env.CLAWQL_OUROBOROS_GATEWAY_URL?.trim() ||
    "clawql://tool"
  ).replace(/\/$/, "");
}

/**
 * 1 credit = this many USD at cash-out (default 1.0).
 * Swarm budgets can mint credits independently of treasury USD.
 */
export function compensationCreditUsdRate(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.CLAWQL_COMPENSATION_CREDIT_USD_RATE?.trim();
  if (raw && Number.isFinite(Number(raw)) && Number(raw) > 0) return Number(raw);
  return 1;
}
