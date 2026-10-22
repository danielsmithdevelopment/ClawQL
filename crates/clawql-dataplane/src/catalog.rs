//! Read-only OpenAPI catalog from the production SQLite format
//! (`packages/clawql-api/src/catalog/catalog-sqlite.ts`).
//!
//! Hot set: all `operations` rows (JSON) loaded at open — same as Bun `LOAD=db`.
//! Cold OpenAPI docs stay gzip'd; `servers[0].url` is materialised per `spec_index`
//! on first base-URL resolve (override via `CLAWQL_API_BASE_URL` / `--base-url`).

use anyhow::{bail, Context, Result};
use flate2::read::GzDecoder;
use parking_lot::Mutex;
use rusqlite::{Connection, OpenFlags};
use serde::Deserialize;
use std::collections::HashMap;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::Arc;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ParameterInfo {
    #[serde(default = "default_string_type")]
    #[allow(dead_code)]
    pub r#type: String,
    pub location: String,
    #[serde(default)]
    #[allow(dead_code)]
    pub required: bool,
}

fn default_string_type() -> String {
    "string".into()
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Operation {
    pub id: String,
    pub method: String,
    pub path: String,
    #[serde(default)]
    pub flat_path: String,
    #[serde(default)]
    #[allow(dead_code)]
    pub description: String,
    #[serde(default)]
    pub parameters: HashMap<String, ParameterInfo>,
    #[serde(default)]
    pub spec_index: i64,
    #[serde(default)]
    #[allow(dead_code)]
    pub spec_label: Option<String>,
}

#[derive(Debug, Deserialize)]
struct OpenApiServers {
    #[serde(default)]
    servers: Vec<OpenApiServer>,
}

#[derive(Debug, Deserialize)]
struct OpenApiServer {
    url: String,
}

pub struct Catalog {
    path: PathBuf,
    /// When set (self-mock / CLI / `CLAWQL_API_BASE_URL`), wins over OpenAPI servers.
    base_url_override: Option<String>,
    by_id: HashMap<String, Operation>,
    conn: Mutex<Connection>,
    server_cache: Mutex<HashMap<i64, String>>,
}

impl Catalog {
    /// Open a production `catalog.sqlite` (read-only).
    pub fn load_sqlite(path: &Path) -> Result<Self> {
        let conn = Connection::open_with_flags(
            path,
            OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
        )
        .with_context(|| format!("open catalog sqlite {}", path.display()))?;

        let version: Option<String> = conn
            .query_row(
                "SELECT value FROM meta WHERE key = 'version'",
                [],
                |r| r.get(0),
            )
            .ok();
        if version.as_deref() != Some("1") {
            bail!(
                "unsupported catalog.sqlite meta.version={:?} (want 1) at {}",
                version,
                path.display()
            );
        }

        let mut by_id = HashMap::new();
        {
            let mut stmt = conn.prepare("SELECT id, spec_index, json FROM operations")?;
            let rows = stmt.query_map([], |row| {
                let id: String = row.get(0)?;
                let spec_index: i64 = row.get(1)?;
                let json: String = row.get(2)?;
                Ok((id, spec_index, json))
            })?;
            for row in rows {
                let (id, spec_index, json) = row?;
                let mut op: Operation =
                    serde_json::from_str(&json).with_context(|| format!("parse op json {id}"))?;
                if op.id.is_empty() {
                    op.id = id.clone();
                }
                if op.spec_index == 0 && spec_index != 0 {
                    op.spec_index = spec_index;
                }
                if by_id.insert(op.id.clone(), op).is_some() {
                    bail!("duplicate operation id {id}");
                }
            }
        }
        if by_id.is_empty() {
            bail!("catalog.sqlite has no operations: {}", path.display());
        }

        Ok(Self {
            path: path.to_path_buf(),
            base_url_override: std::env::var("CLAWQL_API_BASE_URL")
                .ok()
                .map(|s| s.trim_end_matches('/').to_string())
                .filter(|s| !s.is_empty()),
            by_id,
            conn: Mutex::new(conn),
            server_cache: Mutex::new(HashMap::new()),
        })
    }

    pub fn load_path(path: &Path) -> Result<Self> {
        let ext = path
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_ascii_lowercase();
        if ext == "sqlite" || ext == "db" {
            return Self::load_sqlite(path);
        }
        bail!(
            "catalog must be a production .sqlite file (got {}); JSON catalogs are not supported — compile with scripts/dataplane/compile-catalog-sqlite.mjs",
            path.display()
        );
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    pub fn len(&self) -> usize {
        self.by_id.len()
    }

    pub fn get(&self, id: &str) -> Option<&Operation> {
        self.by_id.get(id)
    }

    pub fn list(&self) -> impl Iterator<Item = &Operation> {
        self.by_id.values()
    }

    pub fn with_base_url(mut self, base: impl Into<String>) -> Self {
        let b = base.into().trim_end_matches('/').to_string();
        self.base_url_override = Some(b);
        self
    }

    /// Resolve REST base URL for an operation (override → OpenAPI servers[0]).
    pub fn base_url_for(&self, op: &Operation) -> Result<String> {
        if let Some(ref o) = self.base_url_override {
            return Ok(o.clone());
        }
        let idx = op.spec_index;
        if let Some(hit) = self.server_cache.lock().get(&idx).cloned() {
            return Ok(hit);
        }
        let gz: Vec<u8> = {
            let conn = self.conn.lock();
            conn.query_row(
                "SELECT json_gz FROM openapi_docs WHERE spec_index = ?",
                [idx],
                |r| r.get(0),
            )
            .with_context(|| format!("openapi_docs missing spec_index={idx}"))?
        };
        let mut dec = GzDecoder::new(&gz[..]);
        let mut json = String::new();
        dec.read_to_string(&mut json)
            .context("gunzip openapi_docs")?;
        let doc: OpenApiServers =
            serde_json::from_str(&json).context("parse openapi servers")?;
        let url = doc
            .servers
            .first()
            .map(|s| s.url.trim_end_matches('/').to_string())
            .filter(|s| !s.is_empty())
            .with_context(|| {
                format!(
                    "OpenAPI has no servers[0].url for spec_index={idx}; set --base-url or CLAWQL_API_BASE_URL"
                )
            })?;
        self.server_cache.lock().insert(idx, url.clone());
        Ok(url)
    }
}

pub type SharedCatalog = Arc<Catalog>;

#[cfg(test)]
mod tests {
    use super::*;
    use flate2::write::GzEncoder;
    use flate2::Compression;
    use std::io::Write;

    fn write_pets_fixture(path: &Path) {
        let conn = Connection::open(path).unwrap();
        conn.execute_batch(
            r#"
            PRAGMA journal_mode = WAL;
            CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
            CREATE TABLE operations (id TEXT PRIMARY KEY, spec_index INTEGER NOT NULL, json TEXT NOT NULL);
            CREATE TABLE openapi_docs (spec_index INTEGER PRIMARY KEY, json_gz BLOB NOT NULL);
            "#,
        )
        .unwrap();
        conn.execute("INSERT INTO meta(key,value) VALUES ('version','1')", [])
            .unwrap();
        conn.execute("INSERT INTO meta(key,value) VALUES ('ops','2')", [])
            .unwrap();
        conn.execute("INSERT INTO meta(key,value) VALUES ('docs','1')", [])
            .unwrap();
        let list = r#"{"id":"mock_listPets","method":"GET","path":"/pets","flatPath":"/pets","description":"list","parameters":{},"specIndex":0}"#;
        let get = r#"{"id":"mock_getPet","method":"GET","path":"/pets/{petId}","flatPath":"/pets/{petId}","description":"get","parameters":{"petId":{"type":"string","location":"path","required":true}},"specIndex":0}"#;
        conn.execute(
            "INSERT INTO operations(id,spec_index,json) VALUES (?1,0,?2)",
            rusqlite::params!["mock_listPets", list],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO operations(id,spec_index,json) VALUES (?1,0,?2)",
            rusqlite::params!["mock_getPet", get],
        )
        .unwrap();
        let doc = r#"{"openapi":"3.0.0","info":{"title":"pets","version":"0"},"servers":[{"url":"http://127.0.0.1:9"}],"paths":{}}"#;
        let mut enc = GzEncoder::new(Vec::new(), Compression::new(6));
        enc.write_all(doc.as_bytes()).unwrap();
        let gz = enc.finish().unwrap();
        conn.execute(
            "INSERT INTO openapi_docs(spec_index,json_gz) VALUES (0,?1)",
            rusqlite::params![gz],
        )
        .unwrap();
    }

    #[test]
    fn loads_sqlite_fixture_shape() {
        let dir = std::env::temp_dir().join(format!("clawql-dp-cat-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("catalog.sqlite");
        write_pets_fixture(&path);
        let cat = Catalog::load_sqlite(&path).unwrap();
        assert!(cat.get("mock_listPets").is_some());
        assert_eq!(cat.get("mock_getPet").unwrap().method, "GET");
        assert_eq!(
            cat.base_url_for(cat.get("mock_listPets").unwrap()).unwrap(),
            "http://127.0.0.1:9"
        );
        let _ = std::fs::remove_dir_all(&dir);
    }
}
