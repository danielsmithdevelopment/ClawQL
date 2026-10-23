//! Atomic mandate park / approve / consume — SQLite path matching ADR 0014 / TLA+ Consume.
//!
//! Consume SQL predicate mirrors `packages/clawql-api/src/pending/pending-execution-sqlite.ts`.
//! Postgres (`CLAWQL_PENDING_DATABASE_URL`) is the multi-node bar; this slice ships SQLite
//! for self-host differential + unit tests.

use crate::args_hash::hash_pending_args;
use crate::risk::{level_for_policy, OperationRisk, RiskPolicy};
use anyhow::{anyhow, Context, Result};
use parking_lot::Mutex;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

/// Same conditional consume as TypeScript `CONSUME_SQL`.
pub const CONSUME_SQL: &str = r#"
UPDATE pending_executions
SET status = 'outcome_unknown',
    consumed_at = ?,
    consumed_by = ?,
    last_error = NULL,
    updated_at = ?
WHERE execution_id = ?
  AND status = 'approved'
  AND args_hash = ?
  AND expires_at_ms > ?
RETURNING execution_id
"#;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum PendingStatus {
    Pending,
    Approved,
    Declined,
    Completed,
    Failed,
    Expired,
    OutcomeUnknown,
}

impl PendingStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Pending => "pending",
            Self::Approved => "approved",
            Self::Declined => "declined",
            Self::Completed => "completed",
            Self::Failed => "failed",
            Self::Expired => "expired",
            Self::OutcomeUnknown => "outcome_unknown",
        }
    }

}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PendingRisk {
    pub level: String,
    pub policy: String,
    pub source: String,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PendingRecord {
    pub version: u32,
    pub execution_id: String,
    pub operation_id: String,
    pub args: Map<String, Value>,
    pub fields: Option<Vec<String>>,
    pub where_expr: Option<String>,
    pub args_hash: String,
    pub risk: PendingRisk,
    pub status: String,
    pub created_at: String,
    pub expires_at: String,
    pub approved_at: Option<String>,
    pub completed_at: Option<String>,
    pub last_error: Option<String>,
    pub consumed_at: Option<String>,
    pub consumed_by: Option<String>,
    pub idempotency_capable: bool,
}

impl PendingRecord {
    /// JSON payload with TypeScript field names (`where`, camelCase).
    pub fn to_payload_json(&self) -> Result<String> {
        let mut map = Map::new();
        map.insert("version".into(), json!(self.version));
        map.insert("executionId".into(), json!(self.execution_id));
        map.insert("operationId".into(), json!(self.operation_id));
        map.insert("args".into(), Value::Object(self.args.clone()));
        map.insert(
            "fields".into(),
            match &self.fields {
                Some(f) => json!(f),
                None => Value::Null,
            },
        );
        map.insert(
            "where".into(),
            match &self.where_expr {
                Some(w) => json!(w),
                None => Value::Null,
            },
        );
        map.insert("argsHash".into(), json!(self.args_hash));
        map.insert("risk".into(), serde_json::to_value(&self.risk)?);
        map.insert("status".into(), json!(self.status));
        map.insert("createdAt".into(), json!(self.created_at));
        map.insert("expiresAt".into(), json!(self.expires_at));
        map.insert("approvedAt".into(), json!(self.approved_at));
        map.insert("completedAt".into(), json!(self.completed_at));
        map.insert("lastError".into(), json!(self.last_error));
        map.insert("consumedAt".into(), json!(self.consumed_at));
        map.insert("consumedBy".into(), json!(self.consumed_by));
        map.insert(
            "idempotencyCapable".into(),
            json!(self.idempotency_capable),
        );
        Ok(serde_json::to_string(&Value::Object(map))?)
    }

    pub fn from_payload_json(s: &str) -> Result<Self> {
        let v: Value = serde_json::from_str(s)?;
        let obj = v
            .as_object()
            .ok_or_else(|| anyhow!("pending payload not object"))?;
        let where_expr = obj
            .get("where")
            .and_then(|w| {
                if w.is_null() {
                    None
                } else {
                    w.as_str().map(|s| s.to_string())
                }
            });
        let fields = match obj.get("fields") {
            Some(Value::Null) | None => None,
            Some(Value::Array(a)) => Some(
                a.iter()
                    .filter_map(|x| x.as_str().map(|s| s.to_string()))
                    .collect(),
            ),
            _ => None,
        };
        let args = obj
            .get("args")
            .and_then(|a| a.as_object())
            .cloned()
            .unwrap_or_default();
        let risk: PendingRisk = serde_json::from_value(
            obj.get("risk")
                .cloned()
                .unwrap_or(json!({"level":"MEDIUM","policy":"mandate","source":"spec-default","reason":""})),
        )?;
        Ok(Self {
            version: obj.get("version").and_then(|v| v.as_u64()).unwrap_or(1) as u32,
            execution_id: obj
                .get("executionId")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .into(),
            operation_id: obj
                .get("operationId")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .into(),
            args,
            fields,
            where_expr,
            args_hash: obj
                .get("argsHash")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .into(),
            risk,
            status: obj
                .get("status")
                .and_then(|v| v.as_str())
                .unwrap_or("pending")
                .into(),
            created_at: obj
                .get("createdAt")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .into(),
            expires_at: obj
                .get("expiresAt")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .into(),
            approved_at: obj
                .get("approvedAt")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string()),
            completed_at: obj
                .get("completedAt")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string()),
            last_error: obj
                .get("lastError")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string()),
            consumed_at: obj
                .get("consumedAt")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string()),
            consumed_by: obj
                .get("consumedBy")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string()),
            idempotency_capable: obj
                .get("idempotencyCapable")
                .and_then(|v| v.as_bool())
                .unwrap_or(false),
        })
    }
}

pub fn resolve_clawql_home() -> PathBuf {
    if let Ok(h) = std::env::var("CLAWQL_HOME") {
        let t = h.trim();
        if !t.is_empty() {
            return PathBuf::from(t);
        }
    }
    dirs_home()
        .map(|h| h.join(".ClawQL"))
        .unwrap_or_else(|| PathBuf::from(".ClawQL"))
}

fn dirs_home() -> Option<PathBuf> {
    std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .map(PathBuf::from)
}

pub fn pending_sqlite_path(home: &Path) -> PathBuf {
    home.join("pending-executions.sqlite")
}

pub fn pending_ttl_hours() -> u64 {
    std::env::var("CLAWQL_PENDING_EXECUTION_TTL_HOURS")
        .ok()
        .and_then(|s| s.trim().parse().ok())
        .filter(|&n: &u64| n > 0)
        .map(|n| n.min(24 * 30))
        .unwrap_or(24)
}

pub fn new_execution_id() -> String {
    use rand::RngCore;
    let mut bytes = [0u8; 16];
    rand::thread_rng().fill_bytes(&mut bytes);
    format!("pex_{}", hex::encode(bytes))
}

pub fn assert_safe_execution_id(id: &str) -> Result<&str> {
    let trimmed = id.trim();
    if !trimmed.starts_with("pex_") {
        return Err(anyhow!("Invalid executionId: must start with pex_"));
    }
    let rest = &trimmed[4..];
    if rest.len() < 8
        || rest.len() > 128
        || !rest
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
    {
        return Err(anyhow!("Invalid executionId format"));
    }
    Ok(trimmed)
}

pub fn mandate_idempotency_key(execution_id: &str) -> String {
    format!("clawql-mandate:{}", execution_id.trim())
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn iso_now() -> String {
    // Reuse mcp-style without chrono — good enough for park timestamps.
    crate_iso_now_ms(now_ms())
}

fn crate_iso_now_ms(ms: i64) -> String {
    let secs = (ms / 1000) as u64;
    let millis = (ms % 1000) as u32;
    let days = secs / 86400;
    let tod = secs % 86400;
    let h = tod / 3600;
    let m = (tod % 3600) / 60;
    let s = tod % 60;
    let z = days as i64 + 719468;
    let era = if z >= 0 { z } else { z - 146096 } / 146097;
    let doe = (z - era * 146097) as u64;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let mo = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if mo <= 2 { y + 1 } else { y };
    format!("{y:04}-{mo:02}-{d:02}T{h:02}:{m:02}:{s:02}.{millis:03}Z")
}

fn risk_to_pending(risk: &OperationRisk) -> PendingRisk {
    PendingRisk {
        level: level_for_policy(risk.policy).into(),
        policy: match risk.policy {
            RiskPolicy::Allow => "allow",
            RiskPolicy::Mandate => "mandate",
            RiskPolicy::Block => "block",
        }
        .into(),
        source: risk.source.into(),
        reason: risk.reason.clone(),
    }
}

/// Process-scoped SQLite pending store (shared across gateway workers via WAL).
#[derive(Clone)]
pub struct PendingStore {
    inner: Arc<Mutex<Connection>>,
    home: PathBuf,
}

impl PendingStore {
    pub fn open(home: PathBuf) -> Result<Self> {
        std::fs::create_dir_all(&home)
            .with_context(|| format!("create CLAWQL_HOME {}", home.display()))?;
        let path = pending_sqlite_path(&home);
        let conn = Connection::open(&path)
            .with_context(|| format!("open pending sqlite {}", path.display()))?;
        conn.execute_batch(
            r#"
            PRAGMA journal_mode = WAL;
            PRAGMA busy_timeout = 5000;
            CREATE TABLE IF NOT EXISTS pending_executions (
              execution_id TEXT PRIMARY KEY,
              payload_json TEXT NOT NULL,
              status TEXT NOT NULL,
              args_hash TEXT NOT NULL,
              expires_at_ms INTEGER NOT NULL,
              consumed_at TEXT,
              consumed_by TEXT,
              last_error TEXT,
              updated_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_pending_status ON pending_executions(status);
            "#,
        )?;
        Ok(Self {
            inner: Arc::new(Mutex::new(conn)),
            home,
        })
    }

    pub fn open_default() -> Result<Self> {
        Self::open(resolve_clawql_home())
    }

    pub fn home(&self) -> &Path {
        &self.home
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
            execution_id: execution_id.clone(),
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
            expires_at,
            approved_at: None,
            completed_at: None,
            last_error: None,
            consumed_at: None,
            consumed_by: None,
            idempotency_capable,
        };
        self.upsert(&record, expires_ms)?;
        Ok(record)
    }

    fn upsert(&self, record: &PendingRecord, expires_at_ms: i64) -> Result<()> {
        let payload = record.to_payload_json()?;
        let updated_at = iso_now();
        let conn = self.inner.lock();
        conn.execute(
            r#"
            INSERT INTO pending_executions (
              execution_id, payload_json, status, args_hash, expires_at_ms,
              consumed_at, consumed_by, last_error, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
            ON CONFLICT(execution_id) DO UPDATE SET
              payload_json = excluded.payload_json,
              status = excluded.status,
              args_hash = excluded.args_hash,
              expires_at_ms = excluded.expires_at_ms,
              consumed_at = excluded.consumed_at,
              consumed_by = excluded.consumed_by,
              last_error = excluded.last_error,
              updated_at = excluded.updated_at
            "#,
            params![
                record.execution_id,
                payload,
                record.status,
                record.args_hash,
                expires_at_ms,
                record.consumed_at,
                record.consumed_by,
                record.last_error,
                updated_at,
            ],
        )?;
        Ok(())
    }

    pub fn read(&self, execution_id: &str) -> Result<Option<PendingRecord>> {
        let id = assert_safe_execution_id(execution_id)?;
        let conn = self.inner.lock();
        let payload: Option<String> = conn
            .query_row(
                "SELECT payload_json FROM pending_executions WHERE execution_id = ?1",
                params![id],
                |row| row.get(0),
            )
            .optional()?;
        match payload {
            Some(p) => Ok(Some(PendingRecord::from_payload_json(&p)?)),
            None => Ok(None),
        }
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
            self.upsert(&record, expires_ms)?;
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
        self.upsert(&record, expires_ms)?;
        Ok(record)
    }

    /// Atomic CAS: approved + matching args_hash + not expired → outcome_unknown.
    pub fn try_consume(
        &self,
        execution_id: &str,
        args_hash: &str,
        consumed_by: Option<&str>,
        now_ms_override: Option<i64>,
    ) -> Result<Option<PendingRecord>> {
        let id = assert_safe_execution_id(execution_id)?;
        let ms = now_ms_override.unwrap_or_else(now_ms);
        let consumed_at = crate_iso_now_ms(ms);
        let consumed_by = consumed_by
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(|s| s.to_string())
            .unwrap_or_else(default_consumed_by);

        let mut conn = self.inner.lock();
        let tx = conn.transaction()?;
        let hit: Option<String> = tx
            .query_row(
                CONSUME_SQL,
                params![
                    consumed_at,
                    consumed_by,
                    consumed_at,
                    id,
                    args_hash,
                    ms
                ],
                |row| row.get(0),
            )
            .optional()?;
        if hit.is_none() {
            tx.rollback()?;
            return Ok(None);
        }
        let payload: String = tx.query_row(
            "SELECT payload_json FROM pending_executions WHERE execution_id = ?1",
            params![id],
            |row| row.get(0),
        )?;
        let mut next = PendingRecord::from_payload_json(&payload)?;
        next.status = PendingStatus::OutcomeUnknown.as_str().into();
        next.consumed_at = Some(consumed_at.clone());
        next.consumed_by = Some(consumed_by);
        next.last_error = None;
        let payload = next.to_payload_json()?;
        tx.execute(
            "UPDATE pending_executions SET payload_json = ?1, updated_at = ?2 WHERE execution_id = ?3",
            params![payload, consumed_at, id],
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
        let expires_ms = parse_iso_ms(&record.expires_at).unwrap_or(0);
        record.status = if ok {
            PendingStatus::Completed.as_str().into()
        } else {
            PendingStatus::Failed.as_str().into()
        };
        record.completed_at = Some(iso_now());
        record.last_error = error.map(|s| s.to_string());
        self.upsert(&record, expires_ms)?;
        Ok(())
    }
}

fn default_consumed_by() -> String {
    let host = hostname_best_effort();
    format!("host:{host}:pid:{}", std::process::id())
}

fn hostname_best_effort() -> String {
    std::env::var("HOSTNAME")
        .or_else(|_| std::env::var("COMPUTERNAME"))
        .unwrap_or_else(|_| "dataplane".into())
}

fn parse_iso_ms(iso: &str) -> Option<i64> {
    // Accept …Z with optional fractional seconds — minimal parser via chrono-less path:
    // Prefer Date.parse parity: use `time` crate? Avoid — use known park format only.
    // For expire checks we also store expires_at_ms in the row; decide() uses ISO.
    // Simple: if we can't parse, treat as 0 (expired).
    let s = iso.trim().trim_end_matches('Z');
    let (date, time) = s.split_once('T')?;
    let mut d = date.split('-');
    let y: i64 = d.next()?.parse().ok()?;
    let mo: i64 = d.next()?.parse().ok()?;
    let day: i64 = d.next()?.parse().ok()?;
    let (hms, frac) = match time.split_once('.') {
        Some((hms, f)) => (hms, f),
        None => (time, "0"),
    };
    let mut t = hms.split(':');
    let h: i64 = t.next()?.parse().ok()?;
    let mi: i64 = t.next()?.parse().ok()?;
    let sec: i64 = t.next()?.parse().ok()?;
    let millis: i64 = frac.chars().take(3).collect::<String>().parse().unwrap_or(0);
    // Days from civil (inverse of Hinnant) → unix ms.
    let y = if mo <= 2 { y - 1 } else { y };
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = (y - era * 400) as u64;
    let mp = if mo > 2 { mo - 3 } else { mo + 9 };
    let doy = (153 * mp + 2) / 5 + day - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy as u64;
    let days = (era * 146097 + doe as i64) as i64 - 719468;
    Some(days * 86_400_000 + h * 3_600_000 + mi * 60_000 + sec * 1000 + millis)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::catalog::Operation;
    use crate::risk::classify_http_operation;
    use std::collections::HashMap;

    fn tmp_store() -> PendingStore {
        let dir = std::env::temp_dir().join(format!("clawql-pending-{}", new_execution_id()));
        std::fs::create_dir_all(&dir).unwrap();
        PendingStore::open(dir).unwrap()
    }

    fn post_risk() -> OperationRisk {
        classify_http_operation(&Operation {
            id: "pets.create".into(),
            method: "POST".into(),
            path: "/pets".into(),
            flat_path: String::new(),
            description: String::new(),
            parameters: HashMap::new(),
            spec_index: 0,
            spec_label: None,
        })
    }

    #[test]
    fn park_approve_consume_once() {
        let store = tmp_store();
        let mut args = Map::new();
        args.insert("name".into(), json!("fido"));
        let parked = store
            .park("pets.create", &args, None, None, &post_risk(), false)
            .unwrap();
        assert_eq!(parked.status, "pending");
        store.decide(&parked.execution_id, true).unwrap();
        let first = store
            .try_consume(&parked.execution_id, &parked.args_hash, Some("test"), None)
            .unwrap();
        assert!(first.is_some());
        assert_eq!(first.unwrap().status, "outcome_unknown");
        let second = store
            .try_consume(&parked.execution_id, &parked.args_hash, Some("test"), None)
            .unwrap();
        assert!(second.is_none());
    }

    #[test]
    fn consume_refuses_digest_mismatch() {
        let store = tmp_store();
        let args = Map::new();
        let parked = store
            .park("pets.create", &args, None, None, &post_risk(), false)
            .unwrap();
        store.decide(&parked.execution_id, true).unwrap();
        let bad = store
            .try_consume(
                &parked.execution_id,
                "sha256:deadbeef",
                Some("test"),
                None,
            )
            .unwrap();
        assert!(bad.is_none());
    }
}
