import { generateApiToken } from "./auth.js";
import type { GatewayEnv } from "./env.js";
import { appendAudit } from "./audit.js";
import { tierFromStripePlan, upsertTenant, getTenantByStripeCustomer } from "./tenants.js";

export type StripeEventLike = {
  id: string;
  type: string;
  data: { object: Record<string, unknown> };
};

/** Parse Stripe-Signature header. */
export function parseStripeSignatureHeader(header: string): { t: string; v1: string[] } | null {
  const parts = header.split(",").map((p) => p.trim());
  let t = "";
  const v1: string[] = [];
  for (const part of parts) {
    const [k, v] = part.split("=");
    if (k === "t") t = v ?? "";
    if (k === "v1" && v) v1.push(v);
  }
  if (!t || v1.length === 0) return null;
  return { t, v1 };
}

export async function verifyStripeWebhook(
  payload: string,
  signatureHeader: string,
  secret: string,
  toleranceSeconds = 300
): Promise<{ ok: true; event: StripeEventLike } | { ok: false; reason: string }> {
  if (!secret.trim()) return { ok: false, reason: "webhook secret is required" };
  const parsed = parseStripeSignatureHeader(signatureHeader);
  if (!parsed) return { ok: false, reason: "invalid Stripe-Signature header" };

  const ts = Number(parsed.t);
  if (!Number.isFinite(ts)) return { ok: false, reason: "invalid timestamp" };
  const age = Math.abs(Math.floor(Date.now() / 1000) - ts);
  if (age > toleranceSeconds) return { ok: false, reason: "timestamp outside tolerance" };

  const signed = `${parsed.t}.${payload}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signed));
  const expected = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");

  const match = parsed.v1.some((sig) => timingSafeEqualHex(sig, expected));
  if (!match) return { ok: false, reason: "signature mismatch" };

  try {
    const event = JSON.parse(payload) as StripeEventLike;
    if (!event?.id || !event?.type) return { ok: false, reason: "invalid event JSON" };
    return { ok: true, event };
  } catch {
    return { ok: false, reason: "invalid JSON payload" };
  }
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) {
    out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return out === 0;
}

function meta(obj: Record<string, unknown>): Record<string, string> {
  const m = obj.metadata;
  if (!m || typeof m !== "object") return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(m as Record<string, unknown>)) {
    if (typeof v === "string") out[k] = v;
  }
  return out;
}

export type ProvisionResult = {
  handled: boolean;
  tenantId?: string;
  apiToken?: string;
  eventType: string;
  eventId: string;
};

/**
 * Stripe → D1 tenant provisioning for Phase 1.
 * Creates/updates tenants on subscription created / trialing / invoice paid.
 * Returns a one-time apiToken only when a new token is minted (caller should deliver out-of-band).
 */
export async function processStripeEventForTenants(
  env: GatewayEnv,
  event: StripeEventLike,
  correlationId: string
): Promise<ProvisionResult> {
  if (!env.CLAWQL_TENANTS) {
    return { handled: false, eventType: event.type, eventId: event.id };
  }
  const obj = event.data.object;
  const metadata = meta(obj);

  switch (event.type) {
    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const customerId = String(obj.customer ?? metadata.stripe_customer_id ?? "");
      const subId = String(obj.id ?? "");
      const status = String(obj.status ?? "active");
      const planHint =
        metadata.clawql_tier ||
        metadata.plan ||
        (Array.isArray(obj.items)
          ? ""
          : String(
              (obj.items as { data?: Array<{ price?: { nickname?: string; id?: string } }> })?.data?.[0]
                ?.price?.nickname ??
                (obj.items as { data?: Array<{ price?: { id?: string } }> })?.data?.[0]?.price?.id ??
                ""
            ));
      const tier =
        status === "trialing" ? "trial" : tierFromStripePlan(planHint || metadata.clawql_tier);
      const tenantId =
        metadata.tenant_id?.trim() ||
        metadata.clawql_tenant?.trim() ||
        (customerId ? `stripe_${customerId}` : `sub_${subId}`);

      let existing = customerId
        ? await getTenantByStripeCustomer(env.CLAWQL_TENANTS, customerId)
        : null;
      const mintToken = !existing?.api_token_hash;
      const apiToken = mintToken ? generateApiToken() : undefined;

      const trialEnd = obj.trial_end ? new Date(Number(obj.trial_end) * 1000).toISOString() : null;

      await upsertTenant(env.CLAWQL_TENANTS, {
        tenantId: existing?.tenant_id ?? tenantId,
        tier,
        apiToken,
        stripeCustomerId: customerId || null,
        stripeSubscriptionId: subId || null,
        expiresAt: tier === "trial" ? trialEnd : null,
        status: status === "canceled" || status === "unpaid" ? "inactive" : "active",
        featureFlags: { stripe: true, unlimited_mcp_executions: true },
      });

      await appendAudit(env.CLAWQL_TENANTS, {
        correlationId,
        tenantId: existing?.tenant_id ?? tenantId,
        eventKind: "STRIPE_SUBSCRIPTION_PROVISIONED",
        summary: `${event.type} → tier=${tier}`,
        payload: { stripe_customer_id: customerId, subscription_id: subId, status },
      });

      return {
        handled: true,
        tenantId: existing?.tenant_id ?? tenantId,
        apiToken,
        eventType: event.type,
        eventId: event.id,
      };
    }
    case "checkout.session.completed": {
      const customerId = String(obj.customer ?? "");
      const tenantId =
        metadata.tenant_id?.trim() ||
        metadata.clawql_tenant?.trim() ||
        (customerId ? `stripe_${customerId}` : `checkout_${event.id}`);
      const mode = String(obj.mode ?? "");
      const tier =
        mode === "subscription" && obj.payment_status === "unpaid"
          ? "trial"
          : tierFromStripePlan(metadata.clawql_tier || metadata.plan);

      const existing = customerId
        ? await getTenantByStripeCustomer(env.CLAWQL_TENANTS, customerId)
        : null;
      const mintToken = !existing?.api_token_hash;
      const apiToken = mintToken ? generateApiToken() : undefined;

      await upsertTenant(env.CLAWQL_TENANTS, {
        tenantId: existing?.tenant_id ?? tenantId,
        tier,
        apiToken,
        stripeCustomerId: customerId || null,
        featureFlags: { stripe: true, unlimited_mcp_executions: true },
      });

      await appendAudit(env.CLAWQL_TENANTS, {
        correlationId,
        tenantId: existing?.tenant_id ?? tenantId,
        eventKind: "STRIPE_CHECKOUT_PROVISIONED",
        summary: `checkout.session.completed → tier=${tier}`,
        payload: { stripe_customer_id: customerId },
      });

      return {
        handled: true,
        tenantId: existing?.tenant_id ?? tenantId,
        apiToken,
        eventType: event.type,
        eventId: event.id,
      };
    }
    case "invoice.paid": {
      const customerId = String(obj.customer ?? "");
      if (!customerId) {
        return { handled: false, eventType: event.type, eventId: event.id };
      }
      const existing = await getTenantByStripeCustomer(env.CLAWQL_TENANTS, customerId);
      if (existing) {
        await upsertTenant(env.CLAWQL_TENANTS, {
          tenantId: existing.tenant_id,
          tier: existing.tier === "trial" ? "developer" : existing.tier,
          stripeCustomerId: customerId,
          status: "active",
          expiresAt: null,
          featureFlags: { stripe: true, unlimited_mcp_executions: true },
        });
        await appendAudit(env.CLAWQL_TENANTS, {
          correlationId,
          tenantId: existing.tenant_id,
          eventKind: "STRIPE_INVOICE_PAID",
          summary: "invoice.paid — tenant active",
        });
        return {
          handled: true,
          tenantId: existing.tenant_id,
          eventType: event.type,
          eventId: event.id,
        };
      }
      return { handled: false, eventType: event.type, eventId: event.id };
    }
    default:
      return { handled: false, eventType: event.type, eventId: event.id };
  }
}
