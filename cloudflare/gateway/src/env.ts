/** Cloudflare Worker bindings for the ClawQL edge gateway. */
export type GatewayEnv = {
  CLAWQL_VAULT?: R2Bucket;
  CLAWQL_SEMANTIC_CACHE?: KVNamespace;
  CLAWQL_TENANTS?: D1Database;
  CLAWQL_QUEUE?: Queue;
  /** Shared secret for bootstrap / operator token (Bearer). */
  CLAWQL_BOOTSTRAP_TOKEN?: string;
  /** Stripe webhook signing secret (`whsec_...`). */
  STRIPE_WEBHOOK_SECRET?: string;
  /** Optional origin for Shared+ IDP proxy (K3s/EKS ingress). */
  CLAWQL_IDP_PROXY_ORIGIN?: string;
  CLAWQL_GATEWAY_PROFILE?: string;
};

export type GatewayTier =
  | "developer"
  | "teams"
  | "shared"
  | "dedicated"
  | "enterprise"
  | "trial"
  | "demo";

export type TenantRow = {
  tenant_id: string;
  tier: GatewayTier;
  plugin_bundles: string;
  feature_flags: string;
  api_token_hash: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  r2_prefix: string;
  status: string;
  created_at: string;
  expires_at: string | null;
};

export const EDGE_TIERS = new Set<GatewayTier>(["developer", "teams", "trial", "demo"]);
export const IDP_TIERS = new Set<GatewayTier>(["shared", "dedicated", "enterprise"]);

export function isEdgeTier(tier: string): tier is GatewayTier {
  return EDGE_TIERS.has(tier as GatewayTier);
}

export function isIdpTier(tier: string): boolean {
  return IDP_TIERS.has(tier as GatewayTier);
}

export function vaultPrefixForTenant(tenantId: string): string {
  return `tenant-${tenantId}/vault`;
}
