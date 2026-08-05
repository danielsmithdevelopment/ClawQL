-- ClawQL edge tenants + audit (GTM Phase 1). Apply via wrangler d1 execute or Worker migrate().

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
