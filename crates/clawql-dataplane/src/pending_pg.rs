//! Postgres pending-execution store — multi-node bar (ADR 0014).
//!
//! Same consume predicate as TypeScript `POSTGRES_CONSUME_SQL`.
//! Selected when `CLAWQL_PENDING_DATABASE_URL` is set (or `CLAWQL_PENDING_STORE=postgres`).

use crate::args_hash::hash_pending_args;
use crate::pending::{
    assert_safe_execution_id, crate_iso_now_ms, default_consumed_by, iso_now, new_execution_id,
    now_ms, parse_iso_ms, pending_ttl_hours, risk_to_pending, PendingRecord, PendingStatus,
};
use crate::risk::OperationRisk;
use anyhow::{anyhow, Context, Result};
use parking_lot::Mutex;
use postgres::{Client, NoTls};
use serde_json::{Map, Value};
use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

/// Same predicate shape as SQLite / TLA+ Consume / TS `POSTGRES_CONSUME_SQL`.
pub const POSTGRES_CONSUME_SQL: &str = r#"
UPDATE pending_executions
SET status = 'outcome_unknown',
    consumed_at = CASE WHEN $4::timestamptz IS NULL THEN NOW() ELSE $4::timestamptz END,
    consumed_by = $1,
    last_error = NULL,
    updated_at = CASE WHEN $4::timestamptz IS NULL THEN NOW() ELSE $4::timestamptz END
WHERE execution_id = $2
  AND status = 'approved'
  AND args_hash = $3
  AND expires_at > CASE WHEN $4::timestamptz IS NULL THEN NOW() ELSE $4::timestamptz END
RETURNING execution_id, payload_json, consumed_at, consumed_by
"#;

const DDL: &str = r#"
CREATE TABLE IF NOT EXISTS pending_executions (
  execution_id TEXT PRIMARY KEY,
  payload_json JSONB NOT NULL,
  status TEXT NOT NULL,
  args_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  consumed_by TEXT,
  last_error TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pending_exec_status ON pending_executions(status);
"#;

pub fn pending_database_url() -> Option<String> {
    std::env::var("CLAWQL_PENDING_DATABASE_URL")
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

/// Explicit `CLAWQL_PENDING_STORE` or URL / managed signals — mirrors TS `pendingStoreBackend`.
pub fn pending_backend_kind() -> &'static str {
    let raw = std::env::var("CLAWQL_PENDING_STORE")
        .unwrap_or_default()
        .trim()
        .to_ascii_lowercase();
    if raw == "postgres" || raw == "pg" {
        return "postgres";
    }
    if raw == "sqlite" {
        return "sqlite";
    }
    if raw == "file" || raw == "json" {
        return "sqlite"; // dataplane has no file backend; fall back
    }
    if pending_database_url().is_some() {
        return "postgres";
    }
    if requires_shared_pending_postgres() {
        return "postgres";
    }
    "sqlite"
}

fn requires_shared_pending_postgres() -> bool {
    if env_flag("CLAWQL_PENDING_REQUIRE_POSTGRES") || env_flag("CLAWQL_MANAGED_GATEWAY") {
        return true;
    }
    let surface = std::env::var("CLAWQL_CONSOLE_SURFACE")
        .unwrap_or_default()
        .trim()
        .to_ascii_lowercase();
    if surface == "cloud" || surface == "managed" {
        return true;
    }
    let replicas = std::env::var("CLAWQL_GATEWAY_REPLICAS")
        .ok()
        .and_then(|s| s.trim().parse::<u32>().ok())
        .unwrap_or(1);
    replicas > 1
}

fn env_flag(key: &str) -> bool {
    matches!(
        std::env::var(key)
            .unwrap_or_default()
            .trim()
            .to_ascii_lowercase()
            .as_str(),
        "1" | "true" | "yes"
    )
}

#[derive(Clone)]
pub struct PendingPgStore {
    client: Arc<Mutex<Client>>,
    url_redacted: String,
}

impl PendingPgStore {
    pub fn connect(url: &str) -> Result<Self> {
        let mut client = Client::connect(url, NoTls)
            .with_context(|| "connect CLAWQL_PENDING_DATABASE_URL")?;
        client.batch_execute(DDL).context("ensure pending postgres schema")?;
        let url_redacted = redact_url(url);
        Ok(Self {
            client: Arc::new(Mutex::new(client)),
            url_redacted,
        })
    }

    pub fn label(&self) -> &str {
        &self.url_redacted
    }

    pub fn park(
        &self,
        operation_id: &str,
        args: &Map<String, Value>,
        fields: Option<&[String]>,
        where_expr: Option<&str>,
        risk: &OperationRisk,
        idempotency_capable: bool,
    ) -> Result<PendingRecord> {
        let execution_id = new_execution_id();
        let args_hash = hash_pending_args(operation_id, args, fields, where_expr);
        let created_ms = now_ms();
        let created_at = crate_iso_now_ms(created_ms);
        let ttl_ms = (pending_ttl_hours() as i64) * 60 * 60 * 1000;
        let expires_ms = created_ms + ttl_ms;
        let expires_at = crate_iso_now_ms(expires_ms);
        let record = PendingRecord {
            version: 1,
            execution_id,
            operation_id: operation_id.into(),
            args: args.clone(),
            fields: fields.map(|f| f.to_vec()),
            where_expr: where_expr
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .map(|s| s.to_string()),
            args_hash,
            risk: risk_to_pending(risk),
            status: PendingStatus::Pending.as_str().into(),
            created_at,
            expires_at: expires_at.clone(),
            approved_at: None,
            completed_at: None,
            last_error: None,
            consumed_at: None,
            consumed_by: None,
            idempotency_capable,
        };
        self.upsert(&record)?;
        Ok(record)
    }

    fn upsert(&self, record: &PendingRecord) -> Result<()> {
        let payload = record.to_payload_json()?;
        let payload_val: Value = serde_json::from_str(&payload)?;
        let expires_at = iso_to_system_time(&record.expires_at)
            .ok_or_else(|| anyhow!("invalid expires_at {}", record.expires_at))?;
        let consumed_at: Option<SystemTime> = record
            .consumed_at
            .as_deref()
            .and_then(iso_to_system_time);
        let mut client = self.client.lock();
        client.execute(
            r#"
            INSERT INTO pending_executions (
              execution_id, payload_json, status, args_hash, expires_at,
              consumed_at, consumed_by, last_error, updated_at
            ) VALUES ($1, $2::jsonb, $3, $4, $5, $6, $7, $8, NOW())
            ON CONFLICT (execution_id) DO UPDATE SET
              payload_json = EXCLUDED.payload_json,
              status = EXCLUDED.status,
              args_hash = EXCLUDED.args_hash,
              expires_at = EXCLUDED.expires_at,
              consumed_at = EXCLUDED.consumed_at,
              consumed_by = EXCLUDED.consumed_by,
              last_error = EXCLUDED.last_error,
              updated_at = NOW()
            "#,
            &[
                &record.execution_id,
                &payload_val,
                &record.status,
                &record.args_hash,
                &expires_at,
                &consumed_at,
                &record.consumed_by,
                &record.last_error,
            ],
        )?;
        Ok(())
    }

    pub fn read(&self, execution_id: &str) -> Result<Option<PendingRecord>> {
        let id = assert_safe_execution_id(execution_id)?;
        let mut client = self.client.lock();
        let rows = client.query(
            "SELECT payload_json FROM pending_executions WHERE execution_id = $1",
            &[&id],
        )?;
        if rows.is_empty() {
            return Ok(None);
        }
        let payload: Value = rows[0].get(0);
        Ok(Some(PendingRecord::from_payload_json(
            &serde_json::to_string(&payload)?,
        )?))
    }

    pub fn decide(&self, execution_id: &str, approve: bool) -> Result<PendingRecord> {
        let id = assert_safe_execution_id(execution_id)?;
        let mut record = self
            .read(id)?
            .ok_or_else(|| anyhow!("Unknown executionId: {id}"))?;
        if record.status != PendingStatus::Pending.as_str() {
            return Err(anyhow!(
                "Execution {id} is not pending (status={})",
                record.status
            ));
        }
        let expires_ms = parse_iso_ms(&record.expires_at).unwrap_or(0);
        if expires_ms <= now_ms() {
            record.status = PendingStatus::Expired.as_str().into();
            record.last_error = Some("pending execution expired".into());
            self.upsert(&record)?;
            return Err(anyhow!("Execution {id} expired at {}", record.expires_at));
        }
        let now = iso_now();
        if approve {
            record.status = PendingStatus::Approved.as_str().into();
            record.approved_at = Some(now);
        } else {
            record.status = PendingStatus::Declined.as_str().into();
            record.approved_at = None;
            record.completed_at = Some(now);
        }
        self.upsert(&record)?;
        Ok(record)
    }

    pub fn try_consume(
        &self,
        execution_id: &str,
        args_hash: &str,
        consumed_by: Option<&str>,
        now_ms_override: Option<i64>,
    ) -> Result<Option<PendingRecord>> {
        let id = assert_safe_execution_id(execution_id)?;
        let consumed_by = consumed_by
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(|s| s.to_string())
            .unwrap_or_else(default_consumed_by);
        let now_param: Option<SystemTime> = now_ms_override.map(|ms| {
            UNIX_EPOCH + Duration::from_millis(ms.max(0) as u64)
        });

        let mut client = self.client.lock();
        let mut tx = client.transaction()?;
        let rows = tx.query(
            POSTGRES_CONSUME_SQL,
            &[&consumed_by, &id, &args_hash, &now_param],
        )?;
        if rows.is_empty() {
            tx.rollback()?;
            return Ok(None);
        }
        let payload: Value = rows[0].get(1);
        let consumed_at: Option<std::time::SystemTime> = rows[0].get(2);
        let consumed_by_row: String = rows[0].get(3);
        let mut next = PendingRecord::from_payload_json(&serde_json::to_string(&payload)?)?;
        next.status = PendingStatus::OutcomeUnknown.as_str().into();
        next.consumed_at = Some(system_time_to_iso(consumed_at).unwrap_or_else(iso_now));
        next.consumed_by = Some(consumed_by_row);
        next.last_error = None;
        let payload_val: Value = serde_json::from_str(&next.to_payload_json()?)?;
        tx.execute(
            "UPDATE pending_executions SET payload_json = $1::jsonb WHERE execution_id = $2",
            &[&payload_val, &id],
        )?;
        tx.commit()?;
        Ok(Some(next))
    }

    pub fn mark_completed(&self, execution_id: &str, ok: bool, error: Option<&str>) -> Result<()> {
        let id = assert_safe_execution_id(execution_id)?;
        let mut record = match self.read(id)? {
            Some(r) => r,
            None => return Ok(()),
        };
        if record.status == "completed" || record.status == "failed" {
            return Ok(());
        }
        record.status = if ok {
            PendingStatus::Completed.as_str().into()
        } else {
            PendingStatus::Failed.as_str().into()
        };
        record.completed_at = Some(iso_now());
        record.last_error = error.map(|s| s.to_string());
        self.upsert(&record)?;
        Ok(())
    }
}

fn iso_to_system_time(iso: &str) -> Option<SystemTime> {
    let ms = parse_iso_ms(iso)?;
    if ms < 0 {
        return None;
    }
    Some(UNIX_EPOCH + Duration::from_millis(ms as u64))
}

fn redact_url(url: &str) -> String {
    // postgres://user:pass@host/db → postgres://user:***@host/db
    if let Some(at) = url.find('@') {
        if let Some(scheme_end) = url.find("://") {
            let after_scheme = scheme_end + 3;
            if let Some(colon) = url[after_scheme..at].find(':') {
                let user = &url[after_scheme..after_scheme + colon];
                return format!(
                    "{}{}:***{}",
                    &url[..after_scheme],
                    user,
                    &url[at..]
                );
            }
        }
    }
    url.to_string()
}

fn system_time_to_iso(t: Option<std::time::SystemTime>) -> Option<String> {
    let t = t?;
    let dur = t.duration_since(std::time::UNIX_EPOCH).ok()?;
    Some(crate_iso_now_ms(dur.as_millis() as i64))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn consume_sql_matches_ts_shape() {
        let sql: String = POSTGRES_CONSUME_SQL
            .chars()
            .filter(|c| !c.is_whitespace())
            .collect();
        assert!(sql.contains("status='outcome_unknown'"));
        assert!(sql.contains("status='approved'"));
        assert!(sql.contains("args_hash=$3"));
        assert!(sql.contains("expires_at>"));
        assert!(sql.contains("RETURNING"));
    }

    #[test]
    fn backend_kind_url_selects_postgres() {
        let prev_store = std::env::var("CLAWQL_PENDING_STORE").ok();
        let prev_url = std::env::var("CLAWQL_PENDING_DATABASE_URL").ok();
        std::env::remove_var("CLAWQL_PENDING_STORE");
        std::env::set_var(
            "CLAWQL_PENDING_DATABASE_URL",
            "postgres://clawql:x@127.0.0.1:1/clawql_pending",
        );
        assert_eq!(pending_backend_kind(), "postgres");
        std::env::remove_var("CLAWQL_PENDING_DATABASE_URL");
        assert_eq!(pending_backend_kind(), "sqlite");
        // Restore so integration tests in the same process keep their URL.
        match prev_url {
            Some(u) => std::env::set_var("CLAWQL_PENDING_DATABASE_URL", u),
            None => std::env::remove_var("CLAWQL_PENDING_DATABASE_URL"),
        }
        match prev_store {
            Some(s) => std::env::set_var("CLAWQL_PENDING_STORE", s),
            None => std::env::remove_var("CLAWQL_PENDING_STORE"),
        }
    }

    #[test]
    fn park_approve_consume_postgres_integration() {
        let url = match pending_database_url() {
            Some(u) => u,
            None => {
                eprintln!("skip: CLAWQL_PENDING_DATABASE_URL unset");
                return;
            }
        };
        let store = match PendingPgStore::connect(&url) {
            Ok(s) => s,
            Err(e) => {
                eprintln!("skip: postgres connect failed: {e:#}");
                return;
            }
        };
        let risk = crate::risk::classify_http_operation(&crate::catalog::Operation {
            id: "pets.create".into(),
            method: "POST".into(),
            path: "/pets".into(),
            flat_path: String::new(),
            description: String::new(),
            parameters: std::collections::HashMap::new(),
            spec_index: 0,
            spec_label: None,
        });
        let mut args = Map::new();
        args.insert("name".into(), Value::String("fido".into()));
        let parked = store
            .park("pets.create", &args, None, None, &risk, false)
            .expect("park");
        store.decide(&parked.execution_id, true).expect("approve");
        let first = store
            .try_consume(&parked.execution_id, &parked.args_hash, Some("test-pg"), None)
            .expect("consume");
        assert!(first.is_some());
        let second = store
            .try_consume(&parked.execution_id, &parked.args_hash, Some("test-pg"), None)
            .expect("consume2");
        assert!(second.is_none());
    }
}
