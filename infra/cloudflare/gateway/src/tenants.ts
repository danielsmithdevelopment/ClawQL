import type { GatewayEnv, GatewayTier, TenantRow } from "./env.js";
import { vaultPrefixForTenant } from "./env.js";
import { sha256Hex } from "./auth.js";

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS tenants (
  tenant_id TEXT PRIMARY KEY,
  tier TEXT NOT NULL,
  plugin_bundles TEXT NOT NULL DEFAULT '[]',
  feature_flags TEXT NOT NULL DEFAULT '{}',
  api_token_hash TEXT,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  r2_prefix TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  expires_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_tenants_token ON tenants(api_token_hash);
CREATE INDEX IF NOT EXISTS idx_tenants_stripe_customer ON tenants(stripe_customer_id);
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  correlation_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  event_kind TEXT NOT NULL,
  summary TEXT,
  model TEXT,
  created_at TEXT NOT NULL,
  payload TEXT
);
CREATE INDEX IF NOT EXISTS idx_audit_tenant ON audit_log(tenant_id, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_correlation ON audit_log(correlation_id);
CREATE TABLE IF NOT EXISTS vault_index (
  tenant_id TEXT NOT NULL,
  path TEXT NOT NULL,
  title TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, path)
);
CREATE TABLE IF NOT EXISTS demo_sessions (
  session_id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
`;

let schemaReady = false;

export async function ensureSchema(db: D1Database): Promise<void> {
  if (schemaReady) return;
  const statements = SCHEMA_SQL.split(";")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const sql of statements) {
    await db.prepare(sql).run();
  }
  schemaReady = true;
}

export type UpsertTenantInput = {
  tenantId: string;
  tier: GatewayTier;
  apiToken?: string;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  pluginBundles?: string[];
  featureFlags?: Record<string, unknown>;
  expiresAt?: string | null;
  status?: string;
};

export async function upsertTenant(db: D1Database, input: UpsertTenantInput): Promise<TenantRow> {
  await ensureSchema(db);
  const now = new Date().toISOString();
  const tokenHash = input.apiToken ? await sha256Hex(input.apiToken) : null;
  const prefix = vaultPrefixForTenant(input.tenantId);
  const bundles = JSON.stringify(input.pluginBundles ?? []);
  const flags = JSON.stringify(input.featureFlags ?? {});
  const status = input.status ?? "active";
  const expires = input.expiresAt ?? null;

  await db
    .prepare(
      `INSERT INTO tenants (
        tenant_id, tier, plugin_bundles, feature_flags, api_token_hash,
        stripe_customer_id, stripe_subscription_id, r2_prefix, status, created_at, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(tenant_id) DO UPDATE SET
        tier = excluded.tier,
        plugin_bundles = excluded.plugin_bundles,
        feature_flags = excluded.feature_flags,
        api_token_hash = COALESCE(excluded.api_token_hash, tenants.api_token_hash),
        stripe_customer_id = COALESCE(excluded.stripe_customer_id, tenants.stripe_customer_id),
        stripe_subscription_id = COALESCE(excluded.stripe_subscription_id, tenants.stripe_subscription_id),
        status = excluded.status,
        expires_at = excluded.expires_at`
    )
    .bind(
      input.tenantId,
      input.tier,
      bundles,
      flags,
      tokenHash,
      input.stripeCustomerId ?? null,
      input.stripeSubscriptionId ?? null,
      prefix,
      status,
      now,
      expires
    )
    .run();

  const row = await getTenantById(db, input.tenantId);
  if (!row) throw new Error("tenant upsert failed");
  return row;
}

export async function getTenantById(db: D1Database, tenantId: string): Promise<TenantRow | null> {
  await ensureSchema(db);
  return (
    (await db.prepare("SELECT * FROM tenants WHERE tenant_id = ?").bind(tenantId).first<TenantRow>()) ??
    null
  );
}

export async function getTenantByTokenHash(
  db: D1Database,
  tokenHash: string
): Promise<TenantRow | null> {
  await ensureSchema(db);
  return (
    (await db
      .prepare("SELECT * FROM tenants WHERE api_token_hash = ? AND status = 'active'")
      .bind(tokenHash)
      .first<TenantRow>()) ?? null
  );
}

export async function getTenantByStripeCustomer(
  db: D1Database,
  customerId: string
): Promise<TenantRow | null> {
  await ensureSchema(db);
  return (
    (await db
      .prepare("SELECT * FROM tenants WHERE stripe_customer_id = ?")
      .bind(customerId)
      .first<TenantRow>()) ?? null
  );
}

export function tenantExpired(row: TenantRow, now = Date.now()): boolean {
  if (!row.expires_at) return false;
  return Date.parse(row.expires_at) <= now;
}

export async function resolveTenantFromRequest(
  env: GatewayEnv,
  request: Request,
  bearerToken: string | null
): Promise<{ tenant: TenantRow; via: "token" | "bootstrap" } | { error: string; status: number }> {
  if (!env.CLAWQL_TENANTS) {
    return { error: "D1 tenants binding missing", status: 503 };
  }
  await ensureSchema(env.CLAWQL_TENANTS);

  if (!bearerToken) {
    return { error: "Authorization Bearer token required", status: 401 };
  }

  const bootstrap = env.CLAWQL_BOOTSTRAP_TOKEN?.trim();
  if (bootstrap && bearerToken === bootstrap) {
    let row = await getTenantById(env.CLAWQL_TENANTS, "bootstrap");
    if (!row) {
      row = await upsertTenant(env.CLAWQL_TENANTS, {
        tenantId: "bootstrap",
        tier: "developer",
        apiToken: bootstrap,
        featureFlags: { bootstrap: true },
      });
    }
    return { tenant: row, via: "bootstrap" };
  }

  const hash = await sha256Hex(bearerToken);
  const row = await getTenantByTokenHash(env.CLAWQL_TENANTS, hash);
  if (!row) {
    return { error: "Invalid API token", status: 401 };
  }
  if (tenantExpired(row)) {
    return { error: "Tenant trial/demo expired", status: 403 };
  }
  return { tenant: row, via: "token" };
}

/** Map Stripe price metadata / plan strings onto gateway tiers. */
export function tierFromStripePlan(plan: string | null | undefined): GatewayTier {
  const p = (plan ?? "").toLowerCase();
  if (p.includes("enterprise")) return "enterprise";
  if (p.includes("dedicated")) return "dedicated";
  if (p.includes("shared") || p.includes("starter") || p.includes("idp")) return "shared";
  if (p.includes("team")) return "teams";
  if (p.includes("trial")) return "trial";
  return "developer";
}
