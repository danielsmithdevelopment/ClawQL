import type { GatewayEnv, TenantRow } from "./env.js";

/**
 * Resolve the upstream origin for Shared+/IDP tiers.
 * Prefer per-tenant `feature_flags.idp_proxy_origin`, then Worker env
 * `CLAWQL_IDP_PROXY_ORIGIN` (Pulumi `clawql:idpProxyOrigin`).
 */
export function resolveIdpProxyOrigin(
  env: GatewayEnv,
  tenant?: TenantRow | null
): string | undefined {
  if (tenant?.feature_flags) {
    try {
      const flags = JSON.parse(tenant.feature_flags) as Record<string, unknown>;
      const fromTenant = flags.idp_proxy_origin;
      if (typeof fromTenant === "string" && fromTenant.trim()) {
        return fromTenant.trim().replace(/\/$/, "");
      }
    } catch {
      /* ignore malformed flags */
    }
  }
  const fromEnv = env.CLAWQL_IDP_PROXY_ORIGIN?.trim();
  return fromEnv ? fromEnv.replace(/\/$/, "") : undefined;
}

/** Build RequestInit for reverse-proxying an IDP tenant to K3s/EKS ingress. */
export function buildIdpProxyInit(
  request: Request,
  opts: { tenantId?: string; correlationId: string }
): RequestInit {
  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.set("X-Correlation-Id", opts.correlationId);
  headers.set("X-Forwarded-Proto", "https");
  if (opts.tenantId) {
    headers.set("X-ClawQL-Tenant-Id", opts.tenantId);
  }
  const init: RequestInit = {
    method: request.method,
    headers,
    redirect: "manual",
  };
  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = request.body;
  }
  return init;
}
