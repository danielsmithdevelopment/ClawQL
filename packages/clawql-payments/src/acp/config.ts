/** ACP (Agentic Commerce Protocol) feature flags. */

export function isAcpEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = env.CLAWQL_ACP_ENABLED?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

export function acpMerchantId(env: NodeJS.ProcessEnv = process.env): string {
  return env.CLAWQL_ACP_MERCHANT_ID?.trim() || "clawql";
}
