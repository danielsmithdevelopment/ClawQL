//! Session information-flow (ADR 0015) — Phase B slice for the Rust dataplane.
//!
//! Mirrors `packages/clawql-api/src/ifc/labels.ts` + `session-ifc-enforce.ts`
//! empty-config core so differential tests can lockstep with Lean fixtures.

use crate::catalog::Operation;
use parking_lot::Mutex;
use std::collections::{HashMap, HashSet};
use std::sync::Arc;

pub const PUBLIC_LABEL: &str = "public";

#[derive(Debug, Clone, Default)]
pub struct IfcFlowConfig {
    pub public_destinations: HashSet<String>,
    pub allowed_sources_by_dest: HashMap<String, HashSet<String>>,
}

impl IfcFlowConfig {
    pub fn empty() -> Self {
        let mut public_destinations = HashSet::new();
        public_destinations.insert(PUBLIC_LABEL.into());
        public_destinations.insert("source:public".into());
        Self {
            public_destinations,
            allowed_sources_by_dest: HashMap::new(),
        }
    }
}

/// Whether session IFC is active. Unset → enabled; `0`/`false`/`no` → disabled.
pub fn session_ifc_enabled() -> bool {
    match std::env::var("CLAWQL_ENABLE_SESSION_IFC") {
        Ok(raw) => {
            let t = raw.trim().to_ascii_lowercase();
            !(t == "0" || t == "false" || t == "no")
        }
        Err(_) => true,
    }
}

pub fn label_for_spec(spec_label: Option<&str>) -> String {
    let s = spec_label
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or("unknown")
        .to_ascii_lowercase();
    format!("source:{s}")
}

pub fn is_read_operation(op: &Operation) -> bool {
    matches!(
        op.method.trim().to_ascii_uppercase().as_str(),
        "GET" | "HEAD" | "QUERY"
    )
}

pub fn data_labels_for_operation(op: &Operation) -> Vec<String> {
    vec![label_for_spec(op.spec_label.as_deref())]
}

pub fn dest_labels_for_operation(op: &Operation) -> HashSet<String> {
    let label = label_for_spec(op.spec_label.as_deref());
    if op
        .spec_label
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .is_none()
    {
        return HashSet::from([label]);
    }
    let lower = op.spec_label.as_deref().unwrap().trim().to_ascii_lowercase();
    if lower == "public" || lower == "source:public" {
        return HashSet::from([PUBLIC_LABEL.into()]);
    }
    HashSet::from([label])
}

/// Fail-closed `mayFlow` — same rules as TS `labels.ts` (empty / configured).
pub fn may_flow(
    from_union: &HashSet<String>,
    dest_labels: &HashSet<String>,
    config: &IfcFlowConfig,
) -> bool {
    if from_union.is_empty() {
        return true;
    }
    if dest_labels.is_empty() {
        return false;
    }
    for dest in dest_labels {
        if config.public_destinations.contains(dest) || dest == PUBLIC_LABEL {
            continue;
        }
        if let Some(allowed) = config.allowed_sources_by_dest.get(dest) {
            if allowed.contains("*") {
                continue;
            }
            for lbl in from_union {
                if !allowed.contains(lbl) && lbl != PUBLIC_LABEL {
                    return false;
                }
            }
            continue;
        }
        for lbl in from_union {
            if lbl != PUBLIC_LABEL && !dest_labels.contains(lbl) {
                return false;
            }
        }
    }
    true
}

pub fn parse_ifc_flow_config_json(raw: Option<&str>) -> IfcFlowConfig {
    let mut base = IfcFlowConfig::empty();
    let Some(raw) = raw.map(str::trim).filter(|s| !s.is_empty()) else {
        return base;
    };
    let Ok(parsed) = serde_json::from_str::<serde_json::Value>(raw) else {
        return base;
    };
    if let Some(arr) = parsed.get("publicDestinations").and_then(|v| v.as_array()) {
        for p in arr {
            if let Some(s) = p.as_str().map(str::trim).filter(|s| !s.is_empty()) {
                base.public_destinations.insert(s.into());
            }
        }
    }
    if let Some(obj) = parsed
        .get("allowedSourcesByDest")
        .and_then(|v| v.as_object())
    {
        for (dest, sources) in obj {
            let Some(arr) = sources.as_array() else {
                continue;
            };
            let set: HashSet<String> = arr
                .iter()
                .filter_map(|s| s.as_str().map(|x| x.to_string()))
                .filter(|s| !s.is_empty())
                .collect();
            base.allowed_sources_by_dest.insert(dest.clone(), set);
        }
    }
    base
}

pub fn flow_config_from_env() -> IfcFlowConfig {
    parse_ifc_flow_config_json(std::env::var("CLAWQL_SESSION_IFC_ALLOWED").ok().as_deref())
}

#[derive(Debug, Default)]
pub struct SessionLabelStore {
    inner: Mutex<HashMap<String, HashSet<String>>>,
}

impl SessionLabelStore {
    pub fn new() -> Arc<Self> {
        Arc::new(Self::default())
    }

    pub fn get(&self, session_key: &str) -> HashSet<String> {
        self.inner
            .lock()
            .get(session_key)
            .cloned()
            .unwrap_or_default()
    }

    pub fn accumulate(&self, session_key: &str, news: &[String]) -> HashSet<String> {
        let mut map = self.inner.lock();
        let entry = map.entry(session_key.to_string()).or_default();
        for n in news {
            entry.insert(n.clone());
        }
        entry.clone()
    }

    pub fn clear(&self, session_key: &str) {
        self.inner.lock().remove(session_key);
    }
}

#[derive(Debug, Clone)]
pub struct SessionIfcBlock {
    pub reason: String,
    pub operation_id: String,
    pub session_key: String,
    pub session_labels: Vec<String>,
    pub dest_labels: Vec<String>,
}

/// Before a mutating execute: fail closed when session labels may not flow to dest.
pub fn check_session_ifc_write(
    store: &SessionLabelStore,
    op: &Operation,
    session_id: Option<&str>,
) -> Option<SessionIfcBlock> {
    if !session_ifc_enabled() {
        return None;
    }
    if is_read_operation(op) {
        return None;
    }
    let session_key = resolve_session_label_key(session_id);
    let session_labels = store.get(&session_key);
    let dest_labels = dest_labels_for_operation(op);
    let config = flow_config_from_env();
    if may_flow(&session_labels, &dest_labels, &config) {
        return None;
    }
    let mut session_sorted: Vec<_> = session_labels.into_iter().collect();
    session_sorted.sort();
    let mut dest_sorted: Vec<_> = dest_labels.into_iter().collect();
    dest_sorted.sort();
    Some(SessionIfcBlock {
        reason: "Session information-flow policy blocked this write: accumulated read labels may not flow to the destination (ADR 0015).".into(),
        operation_id: op.id.clone(),
        session_key,
        session_labels: session_sorted,
        dest_labels: dest_sorted,
    })
}

pub fn accumulate_session_ifc_read(
    store: &SessionLabelStore,
    op: &Operation,
    session_id: Option<&str>,
    success: bool,
) {
    if !session_ifc_enabled() || !success || !is_read_operation(op) {
        return;
    }
    let session_key = resolve_session_label_key(session_id);
    let labels = data_labels_for_operation(op);
    store.accumulate(&session_key, &labels);
}

pub fn resolve_session_label_key(session_id: Option<&str>) -> String {
    if let Some(s) = session_id.map(str::trim).filter(|s| !s.is_empty()) {
        return s.to_string();
    }
    if let Ok(s) = std::env::var("CLAWQL_SESSION_ID") {
        let t = s.trim();
        if !t.is_empty() {
            return t.to_string();
        }
    }
    if let Ok(s) = std::env::var("CLAWQL_API_KEY_ID") {
        let t = s.trim();
        if !t.is_empty() {
            return format!("apikey:{t}");
        }
    }
    "default".into()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::catalog::Operation;
    use std::collections::HashMap;

    fn op(method: &str, spec: Option<&str>) -> Operation {
        Operation {
            id: "op1".into(),
            method: method.into(),
            path: "/x".into(),
            flat_path: String::new(),
            description: String::new(),
            parameters: HashMap::new(),
            spec_index: 0,
            spec_label: spec.map(|s| s.into()),
        }
    }

    #[test]
    fn may_flow_empty_from_allows() {
        let cfg = IfcFlowConfig::empty();
        assert!(may_flow(
            &HashSet::new(),
            &HashSet::from(["source:x".into()]),
            &cfg
        ));
    }

    #[test]
    fn may_flow_same_source_allows() {
        let cfg = IfcFlowConfig::empty();
        assert!(may_flow(
            &HashSet::from(["source:x".into()]),
            &HashSet::from(["source:x".into()]),
            &cfg
        ));
    }

    #[test]
    fn may_flow_cross_source_blocks() {
        let cfg = IfcFlowConfig::empty();
        assert!(!may_flow(
            &HashSet::from(["source:x".into()]),
            &HashSet::from(["source:y".into()]),
            &cfg
        ));
    }

    #[test]
    fn may_flow_public_dest_allows() {
        let cfg = IfcFlowConfig::empty();
        assert!(may_flow(
            &HashSet::from(["source:x".into()]),
            &HashSet::from([PUBLIC_LABEL.into()]),
            &cfg
        ));
    }

    #[test]
    fn may_flow_public_label_to_private_allows() {
        let cfg = IfcFlowConfig::empty();
        assert!(may_flow(
            &HashSet::from([PUBLIC_LABEL.into()]),
            &HashSet::from(["source:y".into()]),
            &cfg
        ));
    }

    #[test]
    fn accumulate_is_monotonic() {
        let store = SessionLabelStore::new();
        store.accumulate("s1", &["source:a".into(), "source:b".into()]);
        let after = store.accumulate("s1", &["source:c".into(), "source:a".into()]);
        assert!(after.contains("source:a"));
        assert!(after.contains("source:b"));
        assert!(after.contains("source:c"));
        assert_eq!(after.len(), 3);
    }

    #[test]
    fn write_blocked_after_cross_spec_read() {
        std::env::remove_var("CLAWQL_ENABLE_SESSION_IFC");
        let store = SessionLabelStore::new();
        let read = op("GET", Some("github"));
        accumulate_session_ifc_read(&store, &read, Some("sess"), true);
        let write = op("POST", Some("slack"));
        let block = check_session_ifc_write(&store, &write, Some("sess"));
        assert!(block.is_some());
        let b = block.unwrap();
        assert_eq!(b.operation_id, "op1");
        assert!(b.session_labels.contains(&"source:github".to_string()));
    }

    #[test]
    fn write_allowed_same_spec() {
        std::env::remove_var("CLAWQL_ENABLE_SESSION_IFC");
        let store = SessionLabelStore::new();
        let read = op("GET", Some("slack"));
        accumulate_session_ifc_read(&store, &read, Some("sess"), true);
        let write = op("POST", Some("slack"));
        assert!(check_session_ifc_write(&store, &write, Some("sess")).is_none());
    }

    #[test]
    fn lean_fixture_parity_empty_config() {
        // Mirror LEAN_IFC_FIXTURES / information-flow.differential.test.ts
        let cfg = IfcFlowConfig::empty();
        let cases: &[(&[&str], &str, bool)] = &[
            (&[], "source:x", true),
            (&["source:x"], "source:x", true),
            (&["source:x"], "source:y", false),
            (&[PUBLIC_LABEL], "source:y", true),
            (&["source:x"], PUBLIC_LABEL, true),
        ];
        for (from, dest, expected) in cases {
            let from_set: HashSet<_> = from.iter().map(|s| (*s).to_string()).collect();
            let dest_set = HashSet::from([(*dest).to_string()]);
            assert_eq!(
                may_flow(&from_set, &dest_set, &cfg),
                *expected,
                "from={from:?} dest={dest}"
            );
        }
    }
}
