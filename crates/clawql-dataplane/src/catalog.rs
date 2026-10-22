//! JSON operation catalog (Phase A).
//!
//! ADR 0016 assumed the TypeScript SQLite OOP catalog. That durable on-disk format
//! is not yet a stable public schema in-tree; Phase A uses a JSON fixture that
//! mirrors the fields `execute` needs. Phase B can bind SQLite once the dump
//! format is pinned.

use anyhow::{bail, Context, Result};
use serde::Deserialize;
use std::collections::HashMap;
use std::path::Path;
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
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CatalogFile {
    #[serde(default)]
    pub base_url: String,
    pub operations: Vec<Operation>,
}

#[derive(Debug, Clone)]
pub struct Catalog {
    pub base_url: String,
    by_id: HashMap<String, Operation>,
}

impl Catalog {
    pub fn load_path(path: &Path) -> Result<Self> {
        let raw = std::fs::read_to_string(path)
            .with_context(|| format!("read catalog {}", path.display()))?;
        Self::load_str(&raw)
    }

    pub fn load_str(raw: &str) -> Result<Self> {
        let file: CatalogFile = serde_json::from_str(raw).context("parse catalog JSON")?;
        if file.operations.is_empty() {
            bail!("catalog has no operations");
        }
        let mut by_id = HashMap::new();
        for op in file.operations {
            if by_id.insert(op.id.clone(), op).is_some() {
                bail!("duplicate operation id in catalog");
            }
        }
        Ok(Self {
            base_url: file.base_url,
            by_id,
        })
    }

    pub fn get(&self, id: &str) -> Option<&Operation> {
        self.by_id.get(id)
    }

    pub fn list(&self) -> impl Iterator<Item = &Operation> {
        self.by_id.values()
    }

    pub fn with_base_url(mut self, base: impl Into<String>) -> Self {
        self.base_url = base.into();
        self
    }
}

pub type SharedCatalog = Arc<Catalog>;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn loads_fixture_shape() {
        let raw = include_str!("../fixtures/catalog.json");
        let cat = Catalog::load_str(raw).unwrap();
        assert!(cat.get("mock_listPets").is_some());
        assert_eq!(cat.get("mock_getPet").unwrap().method, "GET");
    }
}
