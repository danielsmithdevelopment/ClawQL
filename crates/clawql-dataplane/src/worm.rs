//! Process-scoped hash-chained WORM (ADR 0016 Phase B).
//!
//! Format matches `clawql-audit` entry shape. Default hash dialect is **CBOR**
//! (RFC 8949 canonical — same as node `cbor.encodeCanonical`). Set
//! `CLAWQL_WORM_DIALECT=json` for the legacy JSON dialect.
//!
//! Gated by `CLAWQL_WORM_ENABLED=1`. Appends are best-effort — never fail execute.

use crate::cbor_canon::encode_canonical;
use parking_lot::Mutex;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};
use uuid::Uuid;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum WormDialect {
    Cbor,
    Json,
}

impl WormDialect {
    pub fn from_env() -> Self {
        match std::env::var("CLAWQL_WORM_DIALECT")
            .unwrap_or_default()
            .trim()
            .to_ascii_lowercase()
            .as_str()
        {
            "json" | "legacy" => Self::Json,
            _ => Self::Cbor,
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Self::Cbor => "cbor",
            Self::Json => "json",
        }
    }
}

pub const WORM_GENESIS_PREV_HASH: &str = "0000000000000000000000000000000000000000000000000000000000000000";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WormEntry {
    pub id: String,
    pub hash: String,
    pub prev_hash: String,
    pub chain_index: u64,
    pub written_at: String,
    pub backend_acks: Vec<String>,
    #[serde(rename = "type")]
    pub entry_type: String,
    pub timestamp: String,
    pub session_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub agent_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<Map<String, Value>>,
}

#[derive(Debug, Clone)]
pub struct WormAppendInput {
    pub entry_type: String,
    pub timestamp: String,
    pub session_id: String,
    pub agent_name: Option<String>,
    pub metadata: Option<Map<String, Value>>,
}

fn sort_keys_deep(value: &Value) -> Value {
    match value {
        Value::Object(obj) => {
            let mut out = Map::new();
            let mut keys: Vec<&String> = obj.keys().collect();
            keys.sort();
            for k in keys {
                out.insert(k.clone(), sort_keys_deep(&obj[k]));
            }
            Value::Object(out)
        }
        Value::Array(arr) => Value::Array(arr.iter().map(sort_keys_deep).collect()),
        other => other.clone(),
    }
}

fn strip_undefined_deep(value: &Value) -> Value {
    // JSON has no undefined; drop null optional agent fields via skip_serializing.
    match value {
        Value::Object(obj) => {
            let mut out = Map::new();
            for (k, v) in obj {
                if v.is_null() && (k == "agentName" || k == "metadata") {
                    continue;
                }
                out.insert(k.clone(), strip_undefined_deep(v));
            }
            Value::Object(out)
        }
        Value::Array(arr) => Value::Array(arr.iter().map(strip_undefined_deep).collect()),
        other => other.clone(),
    }
}

pub fn canonical_json(value: &Value) -> String {
    serde_json::to_string(&sort_keys_deep(&strip_undefined_deep(value))).expect("json")
}

pub fn sha256_hex(bytes: &[u8]) -> String {
    hex::encode(Sha256::digest(bytes))
}

pub fn seal_content_map(
    prev_hash: Option<&str>,
    prev_index: Option<u64>,
    body: &WormAppendInput,
    id: &str,
    written_at: &str,
) -> Map<String, Value> {
    let chain_index = prev_index.map(|i| i + 1).unwrap_or(0);
    let prev = prev_hash.unwrap_or(WORM_GENESIS_PREV_HASH);
    let mut content = Map::new();
    content.insert("id".into(), json!(id));
    content.insert("prevHash".into(), json!(prev));
    content.insert("chainIndex".into(), json!(chain_index));
    content.insert("writtenAt".into(), json!(written_at));
    content.insert("type".into(), json!(body.entry_type));
    content.insert("timestamp".into(), json!(body.timestamp));
    content.insert("sessionId".into(), json!(body.session_id));
    if let Some(a) = &body.agent_name {
        content.insert("agentName".into(), json!(a));
    }
    if let Some(m) = &body.metadata {
        content.insert("metadata".into(), Value::Object(m.clone()));
    }
    content
}

pub fn hash_content(content: &Map<String, Value>, dialect: WormDialect) -> String {
    let value = strip_undefined_deep(&Value::Object(content.clone()));
    match dialect {
        WormDialect::Cbor => sha256_hex(&encode_canonical(&value)),
        WormDialect::Json => sha256_hex(canonical_json(&value).as_bytes()),
    }
}

pub fn seal_entry(
    prev_hash: Option<&str>,
    prev_index: Option<u64>,
    body: &WormAppendInput,
    id: &str,
    written_at: &str,
    dialect: WormDialect,
) -> WormEntry {
    let content = seal_content_map(prev_hash, prev_index, body, id, written_at);
    let chain_index = content
        .get("chainIndex")
        .and_then(|v| v.as_u64())
        .unwrap_or(0);
    let prev = content
        .get("prevHash")
        .and_then(|v| v.as_str())
        .unwrap_or(WORM_GENESIS_PREV_HASH)
        .to_string();
    let hash = hash_content(&content, dialect);
    WormEntry {
        id: id.into(),
        hash,
        prev_hash: prev,
        chain_index,
        written_at: written_at.into(),
        backend_acks: vec!["local".into()],
        entry_type: body.entry_type.clone(),
        timestamp: body.timestamp.clone(),
        session_id: body.session_id.clone(),
        agent_name: body.agent_name.clone(),
        metadata: body.metadata.clone(),
    }
}

fn iso_now() -> String {
    let ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0);
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

pub fn worm_enabled() -> bool {
    std::env::var("CLAWQL_WORM_ENABLED")
        .map(|v| v.trim() == "1")
        .unwrap_or(false)
}

fn default_session() -> String {
    std::env::var("CLAWQL_WORM_SESSION_ID")
        .or_else(|_| std::env::var("CLAWQL_SESSION_ID"))
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "clawql-dataplane".into())
}

fn default_agent() -> Option<String> {
    std::env::var("CLAWQL_WORM_AGENT_NAME")
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

enum LocalBackend {
    Memory { entries: Vec<WormEntry> },
    Sqlite { conn: Connection },
}

/// Process WORM trail — Mutex for single-writer appends.
pub struct ProcessWorm {
    backend: Mutex<LocalBackend>,
    tip: Mutex<Option<(String, u64)>>, // hash, chain_index
    default_session: String,
    default_agent: Option<String>,
    dialect: WormDialect,
}

impl ProcessWorm {
    pub fn boot_from_env() -> Option<Arc<Self>> {
        if !worm_enabled() {
            return None;
        }
        match Self::try_boot() {
            Ok(w) => {
                tracing::info!(dialect = w.dialect.as_str(), "process WORM trail ready");
                Some(Arc::new(w))
            }
            Err(e) => {
                tracing::warn!(error = %e, "process WORM boot failed — continuing without audit");
                None
            }
        }
    }

    fn try_boot() -> anyhow::Result<Self> {
        let mode = std::env::var("CLAWQL_WORM_LOCAL")
            .ok()
            .map(|s| s.trim().to_ascii_lowercase())
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| {
                if std::env::var_os("CLAWQL_WORM_SQLITE_PATH").is_some() {
                    "sqlite".into()
                } else {
                    "memory".into()
                }
            });
        let (backend, tip) = match mode.as_str() {
            "memory" => (LocalBackend::Memory { entries: vec![] }, None),
            "sqlite" => {
                let path = std::env::var("CLAWQL_WORM_SQLITE_PATH")
                    .unwrap_or_else(|_| "./data/clawql-worm.sqlite".into());
                let path = PathBuf::from(path);
                if let Some(parent) = path.parent() {
                    std::fs::create_dir_all(parent)?;
                }
                let conn = open_sqlite(&path)?;
                let tip = load_tip(&conn)?;
                (LocalBackend::Sqlite { conn }, tip)
            }
            other => anyhow::bail!("Unknown CLAWQL_WORM_LOCAL={other}"),
        };
        Ok(Self {
            backend: Mutex::new(backend),
            tip: Mutex::new(tip),
            default_session: default_session(),
            default_agent: default_agent(),
            dialect: WormDialect::from_env(),
        })
    }

    /// Best-effort append. Returns None when disabled / failed.
    pub fn append(&self, mut input: WormAppendInput) -> Option<WormEntry> {
        if input.session_id.is_empty() {
            input.session_id = self.default_session.clone();
        }
        if input.agent_name.is_none() {
            input.agent_name = self.default_agent.clone();
        }
        if input.timestamp.is_empty() {
            input.timestamp = iso_now();
        }
        let written_at = iso_now();
        let id = Uuid::new_v4().to_string();
        let (prev_hash, prev_idx) = {
            let tip = self.tip.lock();
            match &*tip {
                Some((h, i)) => (Some(h.clone()), Some(*i)),
                None => (None, None),
            }
        };
        let entry = seal_entry(
            prev_hash.as_deref(),
            prev_idx,
            &input,
            &id,
            &written_at,
            self.dialect,
        );
        if let Err(e) = self.persist(&entry) {
            if std::env::var("CLAWQL_WORM_DEBUG").ok().as_deref() == Some("1") {
                eprintln!("[clawql-dataplane] WORM append failed: {e}");
            }
            return None;
        }
        *self.tip.lock() = Some((entry.hash.clone(), entry.chain_index));
        Some(entry)
    }

    fn persist(&self, entry: &WormEntry) -> anyhow::Result<()> {
        let mut be = self.backend.lock();
        match &mut *be {
            LocalBackend::Memory { entries } => {
                entries.push(entry.clone());
                Ok(())
            }
            LocalBackend::Sqlite { conn } => {
                let entry_json = serde_json::to_string(entry)?;
                // Persist with TS field names (camelCase) for verifier compatibility.
                let camel = entry_to_camel_json(entry);
                let entry_json = serde_json::to_string(&camel).unwrap_or(entry_json);
                conn.execute(
                    r#"INSERT INTO worm_entries
                        (id, chain_index, hash, prev_hash, written_at, entry_json)
                       VALUES (?1, ?2, ?3, ?4, ?5, ?6)"#,
                    params![
                        entry.id,
                        entry.chain_index as i64,
                        entry.hash,
                        entry.prev_hash,
                        entry.written_at,
                        entry_json
                    ],
                )?;
                Ok(())
            }
        }
    }

    #[allow(dead_code)] // unit tests + future audit CLI
    pub fn verify_memory_chain(&self) -> bool {
        let be = self.backend.lock();
        let entries = match &*be {
            LocalBackend::Memory { entries } => entries.clone(),
            LocalBackend::Sqlite { conn } => match load_all(conn) {
                Ok(e) => e,
                Err(_) => return false,
            },
        };
        verify_entries(&entries, self.dialect)
    }

    #[allow(dead_code)]
    pub fn len_memory(&self) -> usize {
        let be = self.backend.lock();
        match &*be {
            LocalBackend::Memory { entries } => entries.len(),
            LocalBackend::Sqlite { conn } => conn
                .query_row("SELECT COUNT(*) FROM worm_entries", [], |r| r.get::<_, i64>(0))
                .unwrap_or(0) as usize,
        }
    }
}

fn entry_to_camel_json(entry: &WormEntry) -> Value {
    let mut m = Map::new();
    m.insert("id".into(), json!(entry.id));
    m.insert("hash".into(), json!(entry.hash));
    m.insert("prevHash".into(), json!(entry.prev_hash));
    m.insert("chainIndex".into(), json!(entry.chain_index));
    m.insert("writtenAt".into(), json!(entry.written_at));
    m.insert("backendAcks".into(), json!(entry.backend_acks));
    m.insert("type".into(), json!(entry.entry_type));
    m.insert("timestamp".into(), json!(entry.timestamp));
    m.insert("sessionId".into(), json!(entry.session_id));
    if let Some(a) = &entry.agent_name {
        m.insert("agentName".into(), json!(a));
    }
    if let Some(meta) = &entry.metadata {
        m.insert("metadata".into(), Value::Object(meta.clone()));
    }
    Value::Object(m)
}

fn open_sqlite(path: &Path) -> anyhow::Result<Connection> {
    let conn = Connection::open(path)?;
    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS worm_entries (
          id TEXT PRIMARY KEY,
          chain_index INTEGER UNIQUE NOT NULL,
          hash TEXT UNIQUE NOT NULL,
          prev_hash TEXT NOT NULL,
          written_at TEXT NOT NULL,
          entry_json TEXT NOT NULL
        );
        "#,
    )?;
    Ok(conn)
}

fn load_tip(conn: &Connection) -> anyhow::Result<Option<(String, u64)>> {
    let row: Option<(String, i64)> = conn
        .query_row(
            "SELECT hash, chain_index FROM worm_entries ORDER BY chain_index DESC LIMIT 1",
            [],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .optional()?;
    Ok(row.map(|(h, i)| (h, i as u64)))
}

#[allow(dead_code)]
fn load_all(conn: &Connection) -> anyhow::Result<Vec<WormEntry>> {
    let mut stmt =
        conn.prepare("SELECT entry_json FROM worm_entries ORDER BY chain_index ASC")?;
    let rows = stmt.query_map([], |r| r.get::<_, String>(0))?;
    let mut out = Vec::new();
    for row in rows {
        let s = row?;
        let v: Value = serde_json::from_str(&s)?;
        out.push(entry_from_camel(&v)?);
    }
    Ok(out)
}

#[allow(dead_code)]
fn entry_from_camel(v: &Value) -> anyhow::Result<WormEntry> {
    let o = v
        .as_object()
        .ok_or_else(|| anyhow::anyhow!("entry not object"))?;
    Ok(WormEntry {
        id: o.get("id").and_then(|x| x.as_str()).unwrap_or("").into(),
        hash: o.get("hash").and_then(|x| x.as_str()).unwrap_or("").into(),
        prev_hash: o
            .get("prevHash")
            .and_then(|x| x.as_str())
            .unwrap_or("")
            .into(),
        chain_index: o.get("chainIndex").and_then(|x| x.as_u64()).unwrap_or(0),
        written_at: o
            .get("writtenAt")
            .and_then(|x| x.as_str())
            .unwrap_or("")
            .into(),
        backend_acks: o
            .get("backendAcks")
            .and_then(|x| x.as_array())
            .map(|a| {
                a.iter()
                    .filter_map(|x| x.as_str().map(|s| s.to_string()))
                    .collect()
            })
            .unwrap_or_default(),
        entry_type: o.get("type").and_then(|x| x.as_str()).unwrap_or("").into(),
        timestamp: o
            .get("timestamp")
            .and_then(|x| x.as_str())
            .unwrap_or("")
            .into(),
        session_id: o
            .get("sessionId")
            .and_then(|x| x.as_str())
            .unwrap_or("")
            .into(),
        agent_name: o
            .get("agentName")
            .and_then(|x| x.as_str())
            .map(|s| s.to_string()),
        metadata: o.get("metadata").and_then(|x| x.as_object()).cloned(),
    })
}

#[allow(dead_code)]
pub fn verify_entries(entries: &[WormEntry], dialect: WormDialect) -> bool {
    for (i, entry) in entries.iter().enumerate() {
        if i == 0 {
            if entry.chain_index == 0 && entry.prev_hash != WORM_GENESIS_PREV_HASH {
                return false;
            }
        } else {
            let prev = &entries[i - 1];
            if entry.chain_index != prev.chain_index + 1 {
                return false;
            }
            if entry.prev_hash != prev.hash {
                return false;
            }
        }
        let mut content = Map::new();
        content.insert("id".into(), json!(entry.id));
        content.insert("prevHash".into(), json!(entry.prev_hash));
        content.insert("chainIndex".into(), json!(entry.chain_index));
        content.insert("writtenAt".into(), json!(entry.written_at));
        content.insert("type".into(), json!(entry.entry_type));
        content.insert("timestamp".into(), json!(entry.timestamp));
        content.insert("sessionId".into(), json!(entry.session_id));
        if let Some(a) = &entry.agent_name {
            content.insert("agentName".into(), json!(a));
        }
        if let Some(m) = &entry.metadata {
            content.insert("metadata".into(), Value::Object(m.clone()));
        }
        let recomputed = hash_content(&content, dialect);
        if recomputed != entry.hash {
            return false;
        }
    }
    true
}

/// Helper for execute-path events.
pub fn append_best_effort(worm: &Option<Arc<ProcessWorm>>, input: WormAppendInput) {
    if let Some(w) = worm {
        let _ = w.append(input);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn chain_seals_and_verifies_cbor_default() {
        std::env::set_var("CLAWQL_WORM_ENABLED", "1");
        std::env::set_var("CLAWQL_WORM_LOCAL", "memory");
        std::env::remove_var("CLAWQL_WORM_DIALECT");
        let w = ProcessWorm::try_boot().unwrap();
        assert_eq!(w.dialect, WormDialect::Cbor);
        w.append(WormAppendInput {
            entry_type: "HUMAN_DECISION_REQUESTED".into(),
            timestamp: "2026-10-23T00:00:00.000Z".into(),
            session_id: "s1".into(),
            agent_name: None,
            metadata: Some(Map::from_iter([("executionId".into(), json!("pex_x"))])),
        });
        w.append(WormAppendInput {
            entry_type: "HUMAN_APPROVAL".into(),
            timestamp: "2026-10-23T00:00:01.000Z".into(),
            session_id: "s1".into(),
            agent_name: None,
            metadata: None,
        });
        assert_eq!(w.len_memory(), 2);
        assert!(w.verify_memory_chain());
        std::env::remove_var("CLAWQL_WORM_ENABLED");
        std::env::remove_var("CLAWQL_WORM_LOCAL");
    }

    #[test]
    fn seal_cbor_matches_node_golden() {
        let body = WormAppendInput {
            entry_type: "SESSION_START".into(),
            timestamp: "2026-01-01T00:00:00.000Z".into(),
            session_id: "s1".into(),
            agent_name: None,
            metadata: None,
        };
        let e = seal_entry(
            None,
            None,
            &body,
            "00000000-0000-7000-8000-000000000001",
            "2026-01-01T00:00:00.000Z",
            WormDialect::Cbor,
        );
        assert_eq!(
            e.hash,
            "0dcdaa709efa8ec57898029139bb75773f038ccb8d5d7be7690d850004ee95f9"
        );
    }
}
