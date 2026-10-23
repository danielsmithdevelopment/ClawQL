//! Canonical args hash for pending execute park/resume binding.
//! Mirrors `packages/clawql-api/src/pending/args-hash.ts`.

use serde_json::{Map, Value};
use sha2::{Digest, Sha256};

/// Stable JSON: sorted object keys, arrays in order, undefined/null-key omission of missing.
pub fn canonicalize_for_hash(value: &Value) -> String {
    serde_json::to_string(&sort_keys(value)).expect("serialize canonical json")
}

fn sort_keys(value: &Value) -> Value {
    match value {
        Value::Object(obj) => {
            let mut out = Map::new();
            let mut keys: Vec<&String> = obj.keys().collect();
            keys.sort();
            for k in keys {
                let v = &obj[k];
                if v.is_null() {
                    // TS omits `undefined`; JSON null is kept (same as JSON.stringify).
                }
                out.insert(k.clone(), sort_keys(v));
            }
            Value::Object(out)
        }
        Value::Array(arr) => Value::Array(arr.iter().map(sort_keys).collect()),
        other => other.clone(),
    }
}

pub fn hash_pending_args(
    operation_id: &str,
    args: &Map<String, Value>,
    fields: Option<&[String]>,
    where_expr: Option<&str>,
) -> String {
    let mut body = Map::new();
    body.insert("operationId".into(), Value::String(operation_id.into()));
    body.insert("args".into(), Value::Object(args.clone()));
    body.insert(
        "fields".into(),
        match fields {
            Some(f) => Value::Array(f.iter().map(|s| Value::String(s.clone())).collect()),
            None => Value::Null,
        },
    );
    if let Some(w) = where_expr.map(str::trim).filter(|s| !s.is_empty()) {
        body.insert("where".into(), Value::String(w.into()));
    }
    let canonical = canonicalize_for_hash(&Value::Object(body));
    let digest = Sha256::digest(canonical.as_bytes());
    format!("sha256:{}", hex::encode(digest))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn hash_stable_key_order() {
        let mut a = Map::new();
        a.insert("b".into(), json!(1));
        a.insert("a".into(), json!(2));
        let mut b = Map::new();
        b.insert("a".into(), json!(2));
        b.insert("b".into(), json!(1));
        assert_eq!(
            hash_pending_args("op.create", &a, None, None),
            hash_pending_args("op.create", &b, None, None)
        );
    }

    #[test]
    fn where_binds_when_set() {
        let args = Map::new();
        let without = hash_pending_args("op", &args, None, None);
        let with = hash_pending_args("op", &args, None, Some("x == `1`"));
        assert_ne!(without, with);
        assert!(with.starts_with("sha256:"));
    }
}
